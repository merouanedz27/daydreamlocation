import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PrintToolbar } from "@/components/print-toolbar";
import { TicketActions } from "@/components/ticket-share";
import { TicketFrame } from "@/components/ticket-fit";
import { TicketPdfProvider } from "@/components/ticket-pdf";
import { getOrder, getOrderCatalogue, getLabelSlots, getSettings } from "@/lib/queries/orders";
import { ticketFields } from "@/lib/ticket-fields";
import { normalizeSearch } from "@/lib/search";
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
  // les retrouve, pour que le ticket dise la même chose que l'écran. Le même
  // calcul sert à l'e-mail « Nouvelle commande » (`ticket-fields.ts`).
  const categoryByUnit = new Map<number, string | null>();
  for (const model of models) {
    for (const unit of model.units) categoryByUnit.set(unit.id, model.category_slug);
  }
  const fields = ticketFields(
    { ...order, order_lines: order.order_lines.filter((line) => line.is_active) },
    {
      slotOf: (label) => labelSlots.get(normalizeSearch(label)) ?? null,
      categoryOfUnit: (unitId) => categoryByUnit.get(unitId) ?? null,
    },
  );

  const jacketSize = fields.jacketSize
    ? fields.vestSize
      ? `${fields.jacketSize} · ${t("print.ticket.vest")} ${fields.vestSize}`
      : fields.jacketSize
    : null;

  const label = (key: string) => t("print.ticket.field", { label: t(key) });
  const values: Record<string, string | null> = {
    customer: order.customer_name,
    phone: order.customer_phone,
    date: formatDate(order.event_date, l),
    costume: fields.costume,
    jacketSize,
    pantsSize: fields.pantsSize,
    tailor: fields.tailor,
    shirt: fields.shirt,
    shoes: fields.shoes,
    accessories: fields.accessories,
  };
  // Une pièce absente de la commande (pas de chaussures, pas de tailleur) ne
  // prend pas de ligne : sur 4 × 6, chaque ligne vide rapetisse tout le texte.
  // Le client, son numéro et la date restent toujours.
  const row = (key: string, style: RowStyle = {}): Row[] =>
    values[key] || ["customer", "phone", "date"].includes(key)
      ? [{ label: label(`print.ticket.${key}`), value: values[key], ...style }]
      : [];

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
  ].flat();
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
  ].flat();

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

  // Conditions supplémentaires de la boutique (réglages) : en ARABE, sur un
  // bon français comme sur un bon arabe — c'est la langue de ses clients.
  const terms = settings.rental_terms_ar ?? null;
  const shopPhone = settings.shop_phone ?? null;
  const cancelled = order.status === "annulee";

  const cancelledBanner = cancelled && (
    // Un bon d'une commande annulée reste imprimable — pour le dossier — mais
    // ne doit JAMAIS pouvoir passer pour un bon valable : en encre, encadré.
    <p className="mt-[0.6em] border-2 border-black px-3 py-1.5 text-center font-medium">
      {t("print.cancelled")}
    </p>
  );

  return (
    // Les photos 4 × 6 des deux tickets, préparées à l'ouverture : l'aperçu,
    // le PDF partagé et l'impression montrent la MÊME image (ticket-pdf.tsx).
    <TicketPdfProvider fileName={`${t("print.slipTitle")} ${order.order_no}`}>
      <PrintToolbar
        backHref={`/commandes/${order.id}`}
        printButton={false}
        action={<TicketActions />}
      />

      {/* Le format 4 × 6 posé sur TOUT le document, pas seulement sur la page
          nommée `ticket` : Chrome sur Android ignorait la page nommée et
          imposait ses marges (et l'URL en pied de page). Rendu dans la page,
          ce `@page` vient après celui de globals.css et l'emporte.
          Marge NULLE : la marge est DANS le ticket (5 mm), qui fait pile la
          taille de l'étiquette — plus de hauteur devinée. */}
      <style>{"@page { size: 4in 6in; margin: 0; }"}</style>

      <div className="space-y-4 print:space-y-0">
        {/* --- Ticket du CLIENT ------------------------------------------- */}
        <TicketFrame index={0}>
          {/* `print-color-adjust: exact` : sans lui, Chrome « économise
              l'encre » et délave le logo.
              `unoptimized` : chaque logo est servi par SON fichier, et non par
              `/_next/image?url=…`. html-to-image (le PDF partagé) met les images
              en cache par adresse SANS la requête : les deux logos devenaient
              `/_next/image`, et le ticket du costume sortait avec DAYDREAM.
              `priority` sur les deux : une image paresseuse hors de l'écran
              n'est pas encore chargée quand on imprime. */}
          <Image
            src={wordmark}
            alt={t("app.name")}
            priority
            unoptimized
            className="mx-auto h-auto w-[16em] max-w-full [print-color-adjust:exact]"
          />

          {/* Téléphone et avertissements en GRAS, comme sur son modèle. */}
          <div className="mt-[0.5em] space-y-[0.15em] text-center text-[0.86em] leading-snug font-bold">
            {shopPhone && (
              <p>
                {t("print.ticket.shopPhone")}{" "}
                <bdi dir="ltr" className="tabular">
                  {shopPhone}
                </bdi>
              </p>
            )}
            {/* TOUJOURS imprimés, et TOUJOURS en arabe (fr.json porte le même
                texte que ar.json) : ce sont les deux lignes de son modèle. */}
            <div lang="ar" dir="rtl">
              <p className="underline underline-offset-2">{t("print.ticket.idRequired")}</p>
              <p>{t("print.ticket.liability")}</p>
              {terms && <p className="whitespace-pre-line">{terms}</p>}
            </div>
          </div>

          {cancelledBanner}

          <TicketRows rows={[...clientRows, ...money]} className="mt-[0.6em]" />
        </TicketFrame>

        {/* --- Ticket du COSTUME : sans argent ----------------------------
            Le saut de page est AVANT ce ticket, et lui seul : un saut APRÈS
            le premier, sur une feuille pile à sa hauteur, faisait sortir une
            page blanche entre les deux. */}
        <TicketFrame index={1} frameClassName="print:break-before-page">
          <Image
            src={suit}
            alt=""
            priority
            unoptimized
            className="mx-auto h-auto w-[7.5em] max-w-[45%] [print-color-adjust:exact]"
          />
          {cancelledBanner}
          <TicketRows rows={costumeRows} className="mt-[0.6em] text-[1.15em]" />
        </TicketFrame>
      </div>
    </TicketPdfProvider>
  );
}

/*
 * Mise en page de son modèle « Daydream Ticket » : Arial, chaque ligne
 * CENTRÉE, « **Libellé :** valeur ». La feuille 4 × 6 elle-même, et la taille
 * du texte ajustée pour remplir l'étiquette sans déborder : `TicketFrame`
 * (ticket-fit.tsx). Ici, toutes les tailles sont en `em` de cette racine.
 */

type RowStyle = { big?: boolean; underline?: boolean; bullet?: boolean };
type Row = RowStyle & { label: string; value: string | null };

/**
 * « **Libellé :** valeur », une ligne centrée par champ (le client, son
 * numéro et la date gardent leur libellé même vides). `big` = 1,4 fois la
 * taille courante, `underline` souligne le libellé, `bullet` le précède d'un ●.
 */
function TicketRows({ rows, className }: { rows: Row[]; className?: string }) {
  return (
    <div className={cn("space-y-[0.15em] text-center leading-tight", className)}>
      {rows.map(({ label, value, big, underline, bullet }) => (
        <p key={label} className={cn(big && "text-[1.4em]")}>
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
