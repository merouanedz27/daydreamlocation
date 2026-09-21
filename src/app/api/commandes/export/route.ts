import type { NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import writeXlsxFile, { type Row } from "write-excel-file/node";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ordersFilters, parseOrdersQuery, SORTABLE } from "@/lib/orders-query";
import { todayIso } from "@/lib/rental-range";
import { routing, type Locale } from "@/i18n/routing";

// `write-excel-file/node` produit un `Buffer` : runtime Node, pas Edge.
export const runtime = "nodejs";

/** PostgREST plafonne SANS PRÉVENIR à 1 000 lignes : on lit par tranches. */
const CHUNK = 1000;

const STATUS_KEYS: Record<string, string> = {
  reservee: "reserved",
  en_cours: "inProgress",
  retournee: "returned",
  annulee: "cancelled",
};

type ExportOrder = {
  order_no: string;
  customer_name: string;
  customer_phone: string | null;
  event_date: string;
  pickup_date: string;
  return_due_date: string;
  status: string;
  total_price: number;
  amount_paid: number;
  balance: number | null;
  caution_amount: number;
  caution_returned: boolean;
  picked_up: boolean;
  returned: boolean;
  order_lines: {
    external_label: string | null;
    model_name_snapshot: string | null;
    article_units: { ref_code: string } | null;
  }[];
};

/**
 * Export de la liste des commandes au format Excel (`.xlsx`).
 *
 * POURQUOI `.xlsx` ET PAS CSV — le client vient d'un Google Sheet, et un CSV
 * l'aurait trahi de trois façons : Excel retire le 0 initial de « 0551… »
 * (le téléphone devient un nombre), Excel en français attend des « ; », et
 * l'arabe exige un BOM pour ne pas s'afficher en caractères cassés. Un `.xlsx`
 * type chaque cellule : le téléphone reste du texte, une date une date, un
 * montant un nombre qu'on peut additionner. Et une cellule texte n'y est jamais
 * évaluée comme formule — pas d'injection « =… » par un nom de client.
 *
 * MÊMES COMMANDES QU'À L'ÉCRAN — les paramètres sont ceux de la liste
 * (`q`, `statut`, `tri`, `sens`), lus par `parseOrdersQuery` et filtrés par
 * `ordersFilters`, les deux fonctions qu'utilise l'écran. Seule la pagination
 * est ignorée : on exporte TOUT le résultat.
 *
 * ACCÈS — `/api` échappe au proxy et à tout layout : aucun garde ne s'applique
 * sans ce contrôle-ci. RLS reste la vraie protection : un employé n'exporte
 * que ce que la base le laisse lire, c'est-à-dire ce que la liste lui montre.
 * Le coût des pièces externes n'est pas exporté.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const rawLocale = params.get("locale");
  const locale: Locale = routing.locales.includes(rawLocale as Locale)
    ? (rawLocale as Locale)
    : routing.defaultLocale;

  const profile = await getProfile();
  if (!profile) return new Response(null, { status: 401 });

  const query = parseOrdersQuery({
    q: params.get("q") ?? undefined,
    statut: params.get("statut") ?? undefined,
    tri: params.get("tri") ?? undefined,
    sens: params.get("sens") ?? undefined,
  });
  const { search, status } = ordersFilters(query);

  const supabase = await createClient();
  const orders: ExportOrder[] = [];

  for (let from = 0; ; from += CHUNK) {
    let chunk = supabase
      .from("orders")
      .select(
        `order_no, customer_name, customer_phone, event_date, pickup_date,
         return_due_date, status, total_price, amount_paid, balance,
         caution_amount, caution_returned, picked_up, returned,
         order_lines ( external_label, model_name_snapshot, article_units ( ref_code ) )`,
      );
    if (search) chunk = chunk.or(search);
    if (status) chunk = chunk.eq("status", status);

    const { data, error } = await chunk
      .order(SORTABLE[query.sort], { ascending: query.ascending })
      // Départage stable, comme l'écran : sans lui, deux tranches pourraient
      // se chevaucher ou sauter une commande du même jour.
      .order("id", { ascending: false })
      .order("id", { referencedTable: "order_lines", ascending: true })
      .range(from, from + CHUNK - 1);

    if (error) return new Response(null, { status: 500 });
    orders.push(...((data ?? []) as unknown as ExportOrder[]));
    if (!data || data.length < CHUNK) break;
  }

  const t = await getTranslations({ locale });

  const bold = (value: string) => ({ value, fontWeight: "bold" as const });
  const money = (value: number | null) => ({
    value: value ?? 0,
    type: Number,
    format: "#,##0",
  });
  // Minuit UTC : la date d'une commande est un JOUR, sans heure ni fuseau.
  const day = (iso: string) => ({
    value: new Date(`${iso}T00:00:00Z`),
    type: Date,
    format: "dd/mm/yyyy",
  });

  const header: Row = [
    bold(t("orders.orderNo")),
    bold(t("orders.customer")),
    bold(t("orders.phone")),
    bold(t("orders.event")),
    bold(t("orders.pickupDate")),
    bold(t("orders.returnDate")),
    bold(t("orders.statusLabel")),
    bold(t("orders.pieces")),
    bold(t("orders.total")),
    bold(t("orders.paid")),
    bold(t("orders.balance")),
    bold(t("orders.caution")),
    bold(t("orders.cautionReturned")),
    bold(t("orders.pickedUp")),
    bold(t("orders.returned")),
  ];

  const rows: Row[] = orders.map((o) => [
    { value: o.order_no, type: String },
    { value: o.customer_name, type: String },
    // TEXTE, surtout : en nombre, Excel effacerait le 0 initial.
    o.customer_phone ? { value: o.customer_phone, type: String } : null,
    day(o.event_date),
    day(o.pickup_date),
    day(o.return_due_date),
    { value: t(`orders.status.${STATUS_KEYS[o.status] ?? "reserved"}`), type: String },
    {
      value: o.order_lines
        // La référence du stock en premier : c'est elle qu'on retrouve sur le
        // cintre. À défaut, le nom retenu à la commande — une pièce externe ou
        // un vêtement repris du tableur n'a pas de référence.
        .map((l) => l.article_units?.ref_code ?? l.external_label ?? l.model_name_snapshot ?? "")
        .filter(Boolean)
        .join(", "),
      type: String,
    },
    money(o.total_price),
    money(o.amount_paid),
    money(o.balance),
    money(o.caution_amount),
    // Booléens natifs : Excel et Sheets les affichent dans la langue du
    // tableur (VRAI / FAUX en français).
    { value: o.caution_returned, type: Boolean },
    { value: o.picked_up, type: Boolean },
    { value: o.returned, type: Boolean },
  ]);

  const buffer = await writeXlsxFile([header, ...rows], {
    sheet: t("orders.title"),
    rightToLeft: locale === "ar",
    stickyRowsCount: 1,
    columns: [
      { width: 12 },
      { width: 26 },
      { width: 14 },
      { width: 12 },
      { width: 12 },
      { width: 12 },
      { width: 12 },
      { width: 36 },
      { width: 12 },
      { width: 12 },
      { width: 12 },
      { width: 12 },
      { width: 10 },
      { width: 10 },
      { width: 10 },
    ],
  }).toBuffer();

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      // Nom ASCII : un nom arabe exigerait l'encodage RFC 5987, mal lu par
      // certains navigateurs mobiles.
      "Content-Disposition": `attachment; filename="commandes-${todayIso()}.xlsx"`,
      // Des données de clients : jamais en cache partagé.
      "Cache-Control": "private, no-store",
    },
  });
}
