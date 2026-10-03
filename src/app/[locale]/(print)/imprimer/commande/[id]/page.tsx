import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PrintSheet } from "@/components/print-sheet";
import { PrintToolbar } from "@/components/print-toolbar";
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
 * Bon de location — DEUX TICKETS sur une feuille, comme le modèle Word du
 * propriétaire (« Daydream Ticket ») :
 *
 * - en haut, le ticket du CLIENT : logo, téléphone de la boutique, conditions,
 *   les pièces et l'argent (versement, prix, reste). Il repart avec lui ;
 * - en bas, le ticket du COSTUME : les mêmes pièces et tailles, SANS argent.
 *   Il s'accroche au cintre (يتعلق في الكوستوم) : c'est lui qui dit à l'équipe
 *   à qui appartient la housse.
 *
 * On découpe sur le pointillé du milieu.
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

  const field = (key: string) => t("print.ticket.field", { label: t(`print.ticket.${key}`) });
  const rows: [string, string | null][] = [
    [field("customer"), order.customer_name],
    [field("phone"), order.customer_phone],
    [field("date"), formatDate(order.event_date, l)],
    [field("costume"), piece(costume, false)],
    [field("jacketSize"), jacketSize],
    // Pantalon non précisé = même taille que la veste, comme sur son tableur.
    [field("pantsSize"), costume?.name ? pantsSize || costume.size || null : null],
    [field("tailor"), draft.tailor || null],
    [field("shirt"), piece(shirt)],
    [field("shoes"), piece(shoes)],
    [
      field("accessories"),
      [accessory, ...others].map((s) => piece(s)).filter(Boolean).join(" · ") || null,
    ],
  ];

  const balance = order.balance ?? 0;
  const money: [string, string][] = [
    [t("print.ticket.paid"), formatMoney(order.amount_paid, l)],
    [t("print.ticket.price"), formatMoney(order.total_price, l)],
    [
      balance < 0 ? t("orders.toRefund") : t("print.ticket.rest"),
      formatMoney(Math.abs(balance), l),
    ],
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
      <PrintToolbar backHref={`/commandes/${order.id}`} hint={t("print.pdfHint")} />

      <PrintSheet>
        {/* --- Ticket du CLIENT ------------------------------------------- */}
        <section className="flex min-h-[128mm] break-inside-avoid flex-col">
          <TicketHead orderNo={order.order_no} label={t("print.ticket.clientCopy")} />
          {/* `print-color-adjust: exact` : sans lui, Chrome « économise
              l'encre » et délave le logo. */}
          <Image
            src={wordmark}
            alt={t("app.name")}
            priority
            sizes="260px"
            className="mx-auto mt-1 h-auto w-[65mm] [print-color-adjust:exact]"
          />

          {(shopPhone || terms) && (
            <div className="mt-3 space-y-1 text-center text-xs leading-relaxed">
              {shopPhone && (
                <p>
                  {t("print.ticket.shopPhone")}{" "}
                  <bdi dir="ltr" className="tabular font-medium">
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

          <TicketRows rows={rows} />
          <dl className="border-foreground mt-2 grid grid-cols-3 gap-2 border-t pt-2">
            {money.map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted-foreground text-xs">{label}</dt>
                <dd className="tabular text-base font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* --- Le pointillé où l'on découpe -------------------------------- */}
        <div className="text-muted-foreground my-4 flex items-center gap-2 text-xs" aria-hidden>
          <span>✂</span>
          <span className="border-foreground flex-1 border-t border-dashed" />
        </div>

        {/* --- Ticket du COSTUME : sans argent ---------------------------- */}
        <section className="flex break-inside-avoid flex-col">
          <TicketHead orderNo={order.order_no} label={t("print.ticket.costumeCopy")} />
          <Image
            src={suit}
            alt=""
            sizes="96px"
            className="mx-auto h-auto w-[24mm] [print-color-adjust:exact]"
          />
          {cancelledBanner}
          <TicketRows rows={rows} />
        </section>
      </PrintSheet>
    </>
  );
}

/** Le numéro de commande en tête de CHAQUE moitié : une fois découpées, les deux se retrouvent. */
function TicketHead({ orderNo, label }: { orderNo: string; label: string }) {
  return (
    <div className="text-muted-foreground flex items-baseline justify-between text-xs">
      <span>{label}</span>
      <bdi className="text-foreground font-medium">{orderNo}</bdi>
    </div>
  );
}

/** « Libellé : valeur », une ligne par champ ; un champ vide garde sa ligne, comme sur son modèle. */
function TicketRows({ rows }: { rows: [string, string | null][] }) {
  return (
    <dl className="mt-3 space-y-1">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline gap-2">
          <dt className="shrink-0">{label}</dt>
          <dd
            className={cn(
              "border-border min-w-0 flex-1 border-b border-dotted font-medium",
              !value && "text-muted-foreground",
            )}
          >
            {value ? <bdi>{value}</bdi> : " "}
          </dd>
        </div>
      ))}
    </dl>
  );
}
