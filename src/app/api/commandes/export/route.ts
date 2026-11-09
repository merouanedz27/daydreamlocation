import type { NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import writeXlsxFile from "write-excel-file/node";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ORDERS_PARAM_KEYS, ordersFilters, parseOrdersQuery, SORTABLE } from "@/lib/orders-query";
import { pieceOrderIds } from "@/lib/queries/orders-list";
import { todayIso } from "@/lib/rental-range";
import {
  ORDER_COLUMNS,
  ORDER_SELECT,
  orderHeader,
  orderRow,
  type ExportOrder,
} from "@/lib/export/orders-sheet";
import { routing, type Locale } from "@/i18n/routing";

// `write-excel-file/node` produit un `Buffer` : runtime Node, pas Edge.
export const runtime = "nodejs";

/** PostgREST plafonne SANS PRÉVENIR à 1 000 lignes : on lit par tranches. */
const CHUNK = 1000;

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
 * (`q`, `statut`, `tri`, `sens`, `du`, `au`), lus par `parseOrdersQuery` et filtrés par
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

  const query = parseOrdersQuery(
    Object.fromEntries(ORDERS_PARAM_KEYS.map((key) => [key, params.get(key) ?? undefined])),
  );
  const { search, status, from: eventFrom, to: eventTo } = ordersFilters(
    query,
    await pieceOrderIds(query.q),
  );

  const supabase = await createClient();
  const orders: ExportOrder[] = [];

  for (let from = 0; ; from += CHUNK) {
    let chunk = supabase
      .from("orders")
      .select(ORDER_SELECT);
    if (search) chunk = chunk.or(search);
    if (status) chunk = chunk.eq("status", status);
    if (eventFrom) chunk = chunk.gte("event_date", eventFrom);
    if (eventTo) chunk = chunk.lte("event_date", eventTo);

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

  const rows = orders.map((o) => orderRow(o, t));

  const buffer = await writeXlsxFile([orderHeader(t), ...rows], {
    sheet: t("orders.title"),
    rightToLeft: locale === "ar",
    stickyRowsCount: 1,
    columns: ORDER_COLUMNS,
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
