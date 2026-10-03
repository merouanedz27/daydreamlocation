import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PrintSheet } from "@/components/print-sheet";
import { PrintToolbar } from "@/components/print-toolbar";
import { TicketShare } from "@/components/ticket-share";
import {
  getOrder,
  getOrderCatalogue,
  getLabelSlots,
  getSettings,
} from "@/lib/queries/orders";
import { draftFromOrder, type Slot } from "@/lib/quick-draft";
import { normalizeSearch } from "@/lib/search";
import { defaultWindow } from "@/lib/rental-range";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/routing";
import wordmark from "../../../../../../../public/ticket-wordmark.png";
import suit from "../../../../../../../public/ticket-suit.png";

export async function generateMetadata(props: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await props.params;
  const t = await getTranslations({ locale, namespace: "print" });
  const order = await getOrder(Number(id));
  // Le titre devient le NOM DU FICHIER quand on choisit « Enregistrer au
  // format PDF » : autant qu'il dise de quel bon il s'agit.
  return {
    title: order ? `${t("slipTitle")} ${order.order_no} — ${order.customer_name}` : t("slipTitle"),
  };
}

/**
 * Bon de location — DEUX TICKETS, chacun sur sa feuille 4 × 6 pouces, d'après
 * le modèle Word du propriétaire (« Daydream Ticket ») :
 *
 * - en haut, le ticket du CLIENT : logo, téléphone de la boutique, conditions,
 *   les pièces et l'argent (versement, prix, reste). Il repart avec lui ;
 * - en bas, le ticket du COSTUME : les mêmes pièces et tailles, SANS argent.
 *   Il s'accroche au cintre (يتعلق في الكوستوم) : c'est lui qui dit à l'équipe
 *   à qui appartient la housse.
 *
 * CE QUI N'Y FIGURE JAMAIS : le coût et le nom du confrère d'une pièce
 * externe, ni la note interne de la commande.
 */
export default async function OrderSlipPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;

  const [order, settings, { models }, labelSlots] = await Promise.all([
    getOrder(Number(id)),
    getSettings(),
    getOrderCatalogue(),
    getLabelSlots(),
  ]);
  if (!order) notFound();

  const t = await getTranslations();

  // Les pièces remises dans les cases de la saisie (costume, chemise,
  // chaussures, accessoires) — exactement comme le formulaire de modification
  // les retrouve, pour que le ticket dise la même chose que l'écran.
  const categoryByUnit = new Map<number, string | null>();
  for (const model of models) {
    for (const unit of model.units) categoryByUnit.set(unit.id, model.category_slug);
  }
  const draft = draftFromOrder(
    { ...order, order_lines: order.order_lines.filter((line) => line.is_active) },
    {
      slotOf: (label) => labelSlots.get(normalizeSearch(label)) ?? null,
      categoryOfUnit: (unitId) => categoryByUnit.get(unitId) ?? null,
      defaultWindow: defaultWindow(
        order.event_date,
        settings.days_before_event,
        settings.days_after_event,
      ),
    },
  );

  // Un costume DU STOCK, c'est une veste et un pantalon, deux pièces : la
  // seconde n'a pas de case à elle. Sa taille va sur « Taille pantalon » (ou
  // « gilet ») au lieu de s'égarer dans les accessoires.
  const [costume, shirt, shoes, accessory, ...extras] = draft.slots;
  let pantsSize = draft.pantsSize;
  let vestSize = draft.vestSize;
  const others: Slot[] = [];
  for (const slot of extras) {
    const slug = slot.unitId ? categoryByUnit.get(slot.unitId) : null;
    if (slug === "pantalon" && !pantsSize) pantsSize = slot.size;
    else if (slug === "gilet" && !vestSize) vestSize = slot.size;
    else others.push(slot);
  }

  const piece = (slot: Slot | undefined, withSize = true) => {
    if (!slot?.name) return null;
    const name = slot.ref ? `${slot.name} · ${slot.ref}` : slot.name;
    return withSize && slot.size ? `${name} (${slot.size})` : name;
  };

  const jacketSize = costume?.size
    ? vestSize
      ? `${costume.size} · ${t("print.ticket.vest")} ${vestSize}`
      : costume.size
    : null;

  const label = (key: string) => t("print.ticket.field", { label: t(key) });
  const values: Record<string, string | null> = {
    customer: order.customer_name,
    phone: order.customer_phone,
    date: formatDate(order.event_date, l),
    costume: piece(costume, false),
    jacketSize,
    // Pantalon non précisé = même taille que la veste, comme sur son tableur.
    pantsSize: costume?.name ? pantsSize || costume.size || null : null,
    tailor: draft.tailor || null,
    shirt: piece(shirt),
    shoes: piece(shoes),
    accessories: [accessory, ...others].map((s) => piece(s)).filter(Boolean).join(" · ") || null,
  };
  const row = (key: string, style: RowStyle = {}): Row => ({
    label: label(`print.ticket.${key}`),
    value: values[key],
    ...style,
  });

  // Les mêmes champs, mis en page comme les DEUX pages de son modèle Word :
  // le client lit d'abord son nom et la date ; l'équipe, devant le cintre,
  // lit le nom, le costume et le tailleur — soulignés, avec des puces.
  const clientRows = [
    row("customer", { big: true }),
    row("phone"),
    row("date", { big: true }),
    row("costume"),
    row("jacketSize"),
    row("pantsSize"),
    row("tailor"),
    row("shirt"),
    row("shoes"),
    row("accessories"),
  ];
  const costumeRows = [
    row("customer", { big: true, underline: true }),
    row("phone"),
    row("date"),
    row("costume", { big: true, underline: true, bullet: true }),
    row("jacketSize"),
    row("pantsSize", { bullet: true }),
    row("tailor", { big: true, underline: true, bullet: true }),
    row("shirt", { bullet: true }),
    row("shoes", { bullet: true }),
    row("accessories", { bullet: true }),
  ];

  // VERS / PRIX / REST : trois lignes de plus, comme sur son modèle.
  const balance = order.balance ?? 0;
  const money: Row[] = [
    { label: label("print.ticket.paid"), value: formatMoney(order.amount_paid, l) },
    { label: label("print.ticket.price"), value: formatMoney(order.total_price, l) },
    {
      label: label(balance < 0 ? "orders.toRefund" : "print.ticket.rest"),
      value: formatMoney(Math.abs(balance), l),
    },
  ];

  // Les conditions s'impriment dans la langue du bon, sinon dans l'autre :
  // le modèle du propriétaire les porte en arabe même sur un bon français.
  const terms =
    (l === "ar"
      ? (settings.rental_terms_ar ?? settings.rental_terms_fr)
      : (settings.rental_terms_fr ?? settings.rental_terms_ar)) ?? null;
  const shopPhone = settings.shop_phone ?? null;
  const cancelled = order.status === "annulee";

  const cancelledBanner = cancelled && (
    // Un bon d'une commande annulée reste imprimable — pour le dossier — mais
    // ne doit JAMAIS pouvoir passer pour un bon valable : en encre, encadré.
    <p className="border-foreground mt-3 border-2 px-3 py-1.5 text-center font-medium">
      {t("print.cancelled")}
    </p>
  );

  return (
    <>
      <PrintToolbar
        backHref={`/commandes/${order.id}`}
        action={<TicketShare fileName={`${t("print.slipTitle")} ${order.order_no}`} />}
      />

      <div className="space-y-4 print:space-y-0">
        {/* --- Ticket du CLIENT ------------------------------------------- */}
        <PrintSheet data-ticket className={cn(TICKET, "print:break-after-page")}>
          <TicketHead orderNo={order.order_no} label={t("print.ticket.clientCopy")} />
          {/* `print-color-adjust: exact` : sans lui, Chrome « économise
              l'encre » et délave le logo. */}
          <Image
            src={wordmark}
            alt={t("app.name")}
            priority
            sizes="260px"
            className="mx-auto mt-2 h-auto w-[80mm] [print-color-adjust:exact]"
          />

          {/* Téléphone et conditions en GRAS, comme sur son modèle. */}
          {(shopPhone || terms) && (
            <div className="mt-3 space-y-1 text-center text-[10pt] leading-snug font-bold">
              {shopPhone && (
                <p>
                  {t("print.ticket.shopPhone")}{" "}
                  <bdi dir="ltr" className="tabular">
                    {shopPhone}
                  </bdi>
                </p>
              )}
              {terms && (
                <p dir="auto" className="whitespace-pre-line">
                  {terms}
                </p>
              )}
            </div>
          )}

          {cancelledBanner}

          <TicketRows rows={[...clientRows, ...money]} className="mt-3 text-[11pt]" />
        </PrintSheet>

        {/* --- Ticket du COSTUME : sans argent ---------------------------- */}
        <PrintSheet data-ticket className={TICKET}>
          <TicketHead orderNo={order.order_no} label={t("print.ticket.costumeCopy")} />
          <Image
            src={suit}
            alt=""
            sizes="96px"
            className="mx-auto mt-2 h-auto w-[38mm] [print-color-adjust:exact]"
          />
          {cancelledBanner}
          <TicketRows rows={costumeRows} className="mt-2 text-[13pt]" />
        </PrintSheet>
      </div>
    </>
  );
}

/**
 * Une feuille 4 × 6 pouces par ticket (page nommée `ticket`, globals.css), à
 * l'écran comme sur le papier. Mise en page de son modèle « Daydream Ticket » :
 * Arial, chaque ligne CENTRÉE, « **Libellé :** valeur ». Les tailles du modèle
 * (page Letter de 8,5 po) sont ramenées à 4 po de large — × 0,47, arrondi vers
 * le haut pour rester lisible : 26 pt → 17 pt, 20 pt → 13 pt, 16 pt → 11 pt.
 * Le contenu est CENTRÉ sur la feuille ; `justify-center-safe` le recolle en
 * haut s'il dépasse, pour que ce soit le bas — jamais l'en-tête — qui se coupe.
 */
const TICKET = cn(
  "print-ticket flex max-w-[4in] min-h-[6in] flex-col justify-center-safe p-[4mm] sm:p-[4mm]",
  // Arial comme son modèle ; l'arabe retombe sur Cairo si Arial n'a pas les glyphes.
  "font-[family-name:Arial,Helvetica,var(--font-cairo),sans-serif]",
  // À l'impression, HAUTEUR FIXE = la page moins ses marges (152,4 − 2 × 4 mm),
  // et rien ne déborde : un ticket trop long se coupait sur une 2ᵉ page, puis
  // une 3ᵉ — cinq feuilles pour deux tickets. Deux tickets = deux pages, point.
  // Sur une imprimante qui ignore le format 4 × 6 (A4), ça tient d'autant mieux.
  "print:min-h-0 print:h-[144mm] print:overflow-hidden print:break-inside-avoid",
);

type RowStyle = { big?: boolean; underline?: boolean; bullet?: boolean };
type Row = RowStyle & { label: string; value: string | null };

/** Le numéro de commande en tête de CHAQUE ticket : une fois séparés, les deux se retrouvent. */
function TicketHead({ orderNo, label }: { orderNo: string; label: string }) {
  return (
    <div className="flex items-baseline justify-between text-sm">
      <span>{label}</span>
      <bdi className="text-base font-bold">{orderNo}</bdi>
    </div>
  );
}

/**
 * « **Libellé :** valeur », une ligne centrée par champ ; un champ vide garde
 * son libellé, comme sur son modèle. `big` = 17 pt, `underline` souligne le
 * libellé, `bullet` le précède d'un ●.
 */
function TicketRows({ rows, className }: { rows: Row[]; className?: string }) {
  return (
    <div className={cn("space-y-0.5 text-center leading-tight", className)}>
      {rows.map(({ label, value, big, underline, bullet }) => (
        <p key={label} className={cn(big && "text-[17pt]")}>
          {bullet && <span aria-hidden>● </span>}
          <b className={cn(underline && "underline decoration-2 underline-offset-2")}>{label}</b>
          {value && (
            <>
              {" "}
              <bdi>{value}</bdi>
            </>
          )}
        </p>
      ))}
    </div>
  );
}
