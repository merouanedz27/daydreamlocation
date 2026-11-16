import { Fragment } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import { Great_Vibes, Tinos } from "next/font/google";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  CalendarDays,
  Handshake,
  IdCard,
  Phone,
  ShoppingBag,
  TriangleAlert,
} from "lucide-react";
import { PrintToolbar } from "@/components/print-toolbar";
import { TicketActions } from "@/components/ticket-share";
import { TicketFrame } from "@/components/ticket-fit";
import { TicketPdfProvider } from "@/components/ticket-pdf";
import { OrderQr } from "@/components/order-qr";
import {
  BowTieIcon,
  CoinsIcon,
  FacebookIcon,
  HangerIcon,
  InstagramIcon,
  JacketIcon,
  ScissorsIcon,
  ShirtIcon,
  ShoeIcon,
  TagIcon,
  TapeIcon,
  TiktokIcon,
  TrousersIcon,
} from "@/components/ticket-icons";
import { appUrl } from "@/lib/email/send";
import { alterationUrl } from "@/lib/alteration-url";
import {
  getOrder,
  getOrderCatalogue,
  getLabelSlots,
  getSettings,
} from "@/lib/queries/orders";
import { ticketFields } from "@/lib/ticket-fields";
import { splitCostumeSize } from "@/lib/quick-draft";
import { normalizeSearch } from "@/lib/search";
import { SHOP_SOCIALS } from "@/lib/shop-socials";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/routing";
import logo from "../../../../../../../public/logo-print.png";

/**
 * L'écriture manuscrite du bon (« Merci pour votre confiance »…). Servie par
 * l'appli (`next/font`) : présente hors ligne et dans la photo du ticket.
 * Latin seulement — en arabe, ces phrases restent en Cairo.
 */
const script = Great_Vibes({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-script",
  display: "block",
});
/**
 * Le caractère du bon : un romain type Times (la maquette). Tinos a les
 * métriques de Times New Roman. Latin seulement — l'arabe reste en Cairo.
 */
const serif = Tinos({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-serif",
  display: "block",
});
const SCRIPT = "font-[family-name:var(--font-script)] font-normal";
const SCRIPT_LATIN = `${SCRIPT} rtl:font-[family-name:var(--font-cairo)] rtl:font-bold`;

export async function generateMetadata(props: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await props.params;
  const t = await getTranslations({ locale, namespace: "print" });
  const order = await getOrder(Number(id));
  // Le titre devient le NOM DU FICHIER quand on choisit « Enregistrer au
  // format PDF » : autant qu'il dise de quel bon il s'agit.
  return {
    title: order
      ? `${t("slipTitle")} ${order.order_no} — ${order.customer_name}`
      : t("slipTitle"),
  };
}

/**
 * Bon de location — DEUX TICKETS, chacun sur son étiquette 4 × 6 pouces,
 * d'après les maquettes du propriétaire (`docs/NEW-DESIGN/`) :
 *
 * 1. le BON DE LOCATION, copie du magasin : les conditions en arabe (la carte
 *    d'identité est OBLIGATOIRE), le client, les détails, l'argent ;
 * 2. le TICKET CLIENT : le même bon SANS les conditions. En bas, détachable,
 *    la « partie retouche » : le QR que le tailleur scanne — seulement s'il y
 *    a une retouche (le pantalon, en pratique).
 *
 * Noir et blanc, sans émoji. Toutes les tailles sont en `em` d'une seule
 * racine que `fitTicket` ajuste pour REMPLIR l'étiquette (ticket-fit.tsx) —
 * sauf la partie retouche, de taille fixe.
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
  // Vente seule : rien n'est loué, il n'y a pas de bon de location.
  if (!order || !order.has_rental) notFound();

  const t = await getTranslations();
  const tt = await getTranslations("print.ticket");

  // Les pièces remises dans les cases de la saisie (costume, chemise,
  // chaussures, accessoires) — exactement comme le formulaire de modification
  // les retrouve, pour que le ticket dise la même chose que l'écran. Sans
  // référence : le client lit des noms.
  const categoryByUnit = new Map<number, string | null>();
  for (const model of models) {
    for (const unit of model.units)
      categoryByUnit.set(unit.id, unit.part ?? model.category_slug);
  }
  const fields = ticketFields(
    {
      ...order,
      // Les articles VENDUS ne vont pas dans les cases de la tenue : ils ont
      // leur ligne « Achat » (`fields.sales`). Un seul ticket pour les deux.
      order_lines: order.order_lines.filter((line) => line.is_active),
    },
    {
      slotOf: (label) => labelSlots.get(normalizeSearch(label)) ?? null,
      categoryOfUnit: (unitId) => categoryByUnit.get(unitId) ?? null,
      withRefs: false,
    },
  );

  // « 50 · Gilet 50 » : la veste, puis le gilet nommé.
  const size =
    [fields.jacketSize, fields.vestSize && `${tt("vest")} ${fields.vestSize}`]
      .filter(Boolean)
      .join(" · ") || null;
  // Une ligne par champ RENSEIGNÉ : une ligne vide volerait de la hauteur au
  // texte, que `fitTicket` agrandit d'autant.
  const details = (
    [
      { icon: HangerIcon, label: tt("costume"), value: fields.costume },
      { icon: TapeIcon, label: tt("size"), value: size },
      { icon: TrousersIcon, label: tt("pantsSize"), value: fields.pantsSize },
      { icon: ScissorsIcon, label: tt("tailor"), value: fields.tailor },
      { icon: ShirtIcon, label: tt("shirt"), value: fields.shirt },
      { icon: JacketIcon, label: tt("jabador"), value: fields.jabador },
      { icon: ShoeIcon, label: tt("shoes"), value: fields.shoes },
      { icon: BowTieIcon, label: tt("accessories"), value: fields.accessories },
      { icon: ShoppingBag, label: tt("sale"), value: fields.sales },
    ] satisfies Detail[]
  ).filter((d) => Boolean(d.value));

  const balance = order.balance ?? 0;
  const eventDate = formatDate(order.event_date, l);

  // Conditions, en ARABE sur un bon français comme sur un bon arabe — c'est
  // la langue de ses clients : la carte d'identité (OBLIGATOIRE), la
  // responsabilité, puis chaque ligne des conditions de la boutique (réglages).
  const terms = [
    tt("liability"),
    ...(settings.rental_terms_ar ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  ];
  const cancelled = order.status === "annulee";
  // Le même QR sur les DEUX tickets : scanné, il ouvre la commande.
  const orderUrl = `${appUrl()}/${locale}/commandes/${order.id}`;
  // Les retouches (le pantalon, en pratique) : leur QR — le même que celui
  // de l'étiquette — en bas du ticket client, pour le tailleur.
  const alterations = order.order_lines.flatMap((line) =>
    line.is_active && line.line_kind !== "vente" && line.line_alterations
      ? [
          {
            id: line.line_alterations.id,
            // Le NOM de la pièce, jamais sa référence (demande du client).
            name: line.model_name_snapshot ?? line.external_label ?? null,
            // Ancienne ligne « 54 · G 56 · P 56 » : la retouche est sur le
            // pantalon, sa taille seule.
            size: pantsSize(line.size_snapshot),
            note: line.line_alterations.note,
          },
        ]
      : [],
  );

  const header = (
    // QR à GAUCHE, sur un bon arabe aussi (`dir="ltr"`). Bandeau de taille
    // FIXE (pouces, pas `em`) : il ne grandit pas avec le texte, toute la
    // hauteur gagnée va au client et aux détails (demande du client : le bon
    // doit se lire de loin).
    <header
      dir="ltr"
      className="mx-0 flex items-center gap-[8px] border-b-[1.5px] border-black pt-[5px] pb-[4px]"
    >
      <OrderQr value={orderUrl} className="block size-[0.6in] shrink-0" />
      <span aria-hidden className="w-[1.5px] self-stretch bg-black" />
      <div className="flex min-w-0 flex-1 justify-center">
        {/* `unoptimized` : le logo servi par SON fichier (cache de
            html-to-image) ; `priority` : chargé avant l'impression. */}
        <Image
          src={logo}
          alt={t("app.name")}
          priority
          unoptimized
          className="h-[0.52in] w-auto max-w-full object-contain [print-color-adjust:exact]"
        />
      </div>
    </header>
  );

  const cancelledBanner = cancelled && (
    // Un bon d'une commande annulée reste imprimable — pour le dossier — mais
    // ne doit JAMAIS pouvoir passer pour un bon valable : en encre, encadré.
    <p className="mx-[1em] mt-[0.6em] border-2 border-black px-[0.6em] py-[0.3em] text-center font-bold">
      {t("print.cancelled")}
    </p>
  );

  // `bigDate` : sur le TICKET CLIENT, la date de l'événement un peu plus
  // grande (demande du client).
  const renderBody = (bigDate: boolean) => (
    <div className="px-[0.5em] pt-[0.3em]">
      <ClientBox
        name={order.customer_name}
        phone={order.customer_phone}
        date={eventDate}
        bigDate={bigDate}
      />
      <DetailsTable details={details} />
      <MoneyBox
        rows={[
          {
            icon: TagIcon,
            label: tt("paid"),
            value: formatMoney(order.amount_paid, l),
          },
          {
            icon: CoinsIcon,
            label: tt("price"),
            value: formatMoney(order.total_price, l),
          },
          {
            icon: HandshakeBold,
            label: balance < 0 ? t("orders.toRefund") : tt("rest"),
            value: formatMoney(Math.abs(balance), l),
          },
        ]}
      />
    </div>
  );

  // Le numéro de la boutique (Paramètres) — sur le BON DE LOCATION seul,
  // demande du client.
  const shopPhone = settings.shop_phone?.trim() || null;
  const renderFooter = (withShopPhone: boolean) => (
    <>
      <Spacer />
      <footer className="px-[0.5em] pb-[2px]">
        {/* Tailles FIXES (pt) : le pied de page ne grandit pas avec le
            texte, et ces lignes sans retour ne sortent jamais de l'étiquette. */}
        <ul
          dir="ltr"
          className="flex flex-wrap items-center justify-center gap-x-[0.5em] border-t-[1.5px] border-black pt-[3px] text-[6.8pt] whitespace-nowrap rtl:text-[6.3pt]"
        >
          <Social icon={InstagramIcon}>{SHOP_SOCIALS.instagram}</Social>
          <li aria-hidden className="h-[1.2em] w-[1.5px] bg-black" />
          <Social icon={TiktokIcon}>{SHOP_SOCIALS.tiktok}</Social>
          <li aria-hidden className="h-[1.2em] w-[1.5px] bg-black" />
          <Social icon={FacebookIcon}>{SHOP_SOCIALS.facebook}</Social>
        </ul>
        {withShopPhone && shopPhone && (
          <p
            dir="ltr"
            className="mt-[2px] flex items-center justify-center gap-[0.4em] text-[11pt] leading-none font-bold"
          >
            <Phone className="size-[1em] shrink-0 fill-black" aria-hidden />
            <bdi className="tabular">{shopPhone}</bdi>
          </p>
        )}
        <ScriptRule>{tt("thanks")}</ScriptRule>
      </footer>
    </>
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

      {/* Le format 4 × 6 posé sur TOUT le document, marge NULLE : la marge
          est DANS le ticket, qui fait pile la taille de l'étiquette. */}
      <style>{"@page { size: 4in 6in; margin: 0; }"}</style>

      {/* La police manuscrite posée ICI : la copie que `ticket-pdf`
          photographie se range dans le même parent, elle en hérite. */}
      <div
        className={cn(
          script.variable,
          serif.variable,
          "space-y-4 print:space-y-0",
        )}
      >
        {/* --- BON DE LOCATION — copie du magasin --------------------------- */}
        <TicketFrame index={0}>
          <TicketCard>
            {header}
            {cancelledBanner}

            {/* Conditions de location, centrées, en arabe. */}
            <section
              lang="ar"
              dir="rtl"
              className="mx-[0.8em] mt-[0.3em] text-center font-[family-name:var(--font-cairo)] leading-[1.3] font-bold"
            >
              <h2 className="flex items-center justify-center gap-[0.4em] text-[1.15em] font-extrabold">
                <TriangleAlert className="size-[1.05em] shrink-0" aria-hidden />
                <span>{tt("idRequired")}</span>
                <IdCard className="size-[1.15em] shrink-0" aria-hidden />
                <TriangleAlert className="size-[1.05em] shrink-0" aria-hidden />
              </h2>
              {terms.map((term, i) => (
                <p key={i} className="text-[0.95em]">
                  {term}
                </p>
              ))}
            </section>

            {renderBody(false)}
            {renderFooter(true)}
          </TicketCard>
        </TicketFrame>

        {/* --- TICKET CLIENT ------------------------------------------------
            Le saut de page est AVANT ce ticket, et lui seul : un saut APRÈS
            le premier, sur une feuille pile à sa hauteur, faisait sortir une
            page blanche entre les deux. */}
        <TicketFrame index={1} frameClassName="print:break-before-page">
          <TicketCard>
            {header}
            {cancelledBanner}
            {renderBody(true)}
            {renderFooter(false)}
          </TicketCard>

          {/* PARTIE RETOUCHE — détachée le long des pointillés et donnée au
                tailleur avec le pantalon. Une par retouche. */}
          {/* Taille FIXE, hors de `--fit` : sans elle, une commande d'une
                seule pièce agrandissait tout le ticket — et cette partie avec.
                Elle garde la même hauteur quel que soit le reste ; c'est le
                haut du ticket qui s'ajuste autour d'elle. */}
          {alterations.map((a) => (
            <section
              key={a.id}
              style={{ fontSize: "6.5pt" }}
              className={cn(SERIF, "mt-[0.35em] shrink-0")}
            >
              <div className="flex items-center gap-[0.4em]">
                <ScissorsIcon className="size-[1.1em] shrink-0" aria-hidden />
                <span className="flex-1 border-t-[1.5px] border-dashed border-black" />
                <span className="text-[0.68em] font-bold tracking-[0.12em] uppercase">
                  {tt("alterationPart")}
                </span>
                <span className="w-[1em] border-t-[1.5px] border-dashed border-black" />
              </div>

              {/* Le texte COLLÉ au QR, le tout calé au bout (demande du
                  client) : un seul bloc à découper. */}
              <div className="mt-[0.25em] flex items-center justify-end gap-[0.6em] px-[0.4em]">
                {/* Le client, puis la pièce, sa taille et la date sur UNE
                      ligne, puis la retouche — sans cadre (demande du
                      client). Collée au pantalon : basse. */}
                <div className="flex min-w-0 flex-col justify-center leading-tight">
                  <p className="flex min-w-0 items-baseline gap-[0.5em]">
                    <span className="shrink-0 text-[0.75em] font-semibold tracking-[0.14em] uppercase">
                      {tt("alteration")}
                    </span>
                    <bdi className="min-w-0 truncate text-start text-[1.15em] font-bold">
                      {order.customer_name}
                    </bdi>
                  </p>
                  <p className="flex min-w-0 items-baseline gap-x-[0.5em] whitespace-nowrap">
                    {a.name && (
                      // « Tuxedo A · Pantalon » : la retouche est toujours
                      // sur le pantalon — dit une fois, même si le nom le porte.
                      <bdi className="min-w-0 truncate text-start">
                        {a.name}
                        {!a.name
                          .toLowerCase()
                          .includes(tt("pants").toLowerCase()) &&
                          ` · ${tt("pants")}`}
                      </bdi>
                    )}
                    {a.size && (
                      <span className="shrink-0 font-bold">
                        {t("alterations.size", { size: a.size })}
                      </span>
                    )}
                    <span className="tabular shrink-0 font-bold">
                      {eventDate}
                    </span>
                  </p>
                  <p className="flex min-w-0 items-start gap-[0.35em] text-start font-bold">
                    <ScissorsIcon
                      className="mt-[0.15em] size-[1em] shrink-0"
                      aria-hidden
                    />
                    <bdi className="line-clamp-2 min-w-0 wrap-break-word">
                      {a.note}
                    </bdi>
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-center justify-center gap-[0.15em]">
                  {/* 0,5 pouce FIXE (12,7 mm) : c'est lui qui donne sa
                        hauteur à la partie (collée au pantalon, elle doit
                        rester petite), et il se scanne encore au téléphone. */}
                  <OrderQr
                    value={alterationUrl(appUrl(), locale, a.id)}
                    className="block size-[0.5in]"
                  />
                  <span className="text-[0.6em] leading-none font-bold tracking-[0.14em] uppercase">
                    {tt("scan")}
                  </span>
                </div>
              </div>
            </section>
          ))}
        </TicketFrame>
      </div>
    </TicketPdfProvider>
  );
}

function pantsSize(size: string | null): string | null {
  if (!size?.includes("·")) return size;
  const split = splitCostumeSize(size);
  return split.pants || split.jacket || null;
}

/* --- Pièces de la mise en page (toutes en `em`) ---------------------------- */

type IconType = React.ComponentType<{
  className?: string;
  "aria-hidden"?: boolean;
}>;
type Detail = { icon: IconType; label: string; value: string | null };

/** Le romain du bon (Tinos) — l'arabe reste en Cairo. */
const SERIF =
  "font-[family-name:var(--font-serif),var(--font-cairo),serif] rtl:font-[family-name:var(--font-cairo),sans-serif]";

/** Le cadre DOUBLE du ticket (maquette), étiré jusqu'au bas. */
function TicketCard({ children }: { children: React.ReactNode }) {
  return (
    // Le contenu s'écarte du double filet (≈ 7 px) pour respirer.
    <div className={cn(SERIF, "relative flex grow flex-col px-[10px] py-[5px]")}>
      <NotchedFrame radius={13} stroke={2.6} inner={{ gap: 4.5, stroke: 1 }} />
      {children}
    </div>
  );
}

/**
 * Un cadre aux coins ÉCHANCRÉS (quart de cercle rentrant), simple ou double
 * comme la maquette : un trait épais dehors, un fin dedans, qui suit la même
 * échancrure. Quatre coins en SVG + des traits droits — un seul SVG étiré
 * déformerait les arcs. Mesures en px, traits centrés sur le bord.
 * `dir="ltr"` : le cadre est symétrique, rien à miroiter en arabe.
 */
function NotchedFrame({
  radius: r,
  stroke,
  inner,
}: {
  radius: number;
  stroke: number;
  inner?: { gap: number; stroke: number };
}) {
  const gap = inner?.gap ?? 0;
  const R = r + gap;
  const xi = Math.sqrt(R * R - gap * gap);
  const C = Math.ceil(R + 2);
  const ink = "absolute bg-black [print-color-adjust:exact]";
  const lines: React.CSSProperties[] = [];
  const edge = (offset: number, width: number) => {
    const o = offset - width / 2;
    lines.push(
      { top: o, height: width, insetInlineStart: C, insetInlineEnd: C },
      { bottom: o, height: width, insetInlineStart: C, insetInlineEnd: C },
      { insetInlineStart: o, width, top: C, bottom: C },
      { insetInlineEnd: o, width, top: C, bottom: C },
    );
  };
  edge(0, stroke);
  if (inner) edge(gap, inner.stroke);
  const corners: React.CSSProperties[] = [
    { top: 0, insetInlineStart: 0 },
    { top: 0, insetInlineEnd: 0, transform: "scaleX(-1)" },
    { bottom: 0, insetInlineStart: 0, transform: "scaleY(-1)" },
    { bottom: 0, insetInlineEnd: 0, transform: "scale(-1)" },
  ];
  return (
    // Rentré d'un demi-trait : le filet reste DANS sa boîte. Débordant d'un
    // pixel, il faisait croire à `fitTicket` que le contenu dépassait.
    <div
      dir="ltr"
      aria-hidden
      className="pointer-events-none absolute"
      style={{ inset: stroke / 2 }}
    >
      {lines.map((style, i) => (
        <span key={i} className={ink} style={style} />
      ))}
      {corners.map((style, i) => (
        <svg
          key={i}
          width={C}
          height={C}
          viewBox={`0 0 ${C} ${C}`}
          className="absolute overflow-visible"
          style={style}
          fill="none"
          stroke="#000"
        >
          <path
            d={`M${C} 0H${r}A${r} ${r} 0 0 1 0 ${r}V${C}`}
            strokeWidth={stroke}
          />
          {inner && (
            <path
              d={`M${C} ${gap}H${xi}A${R} ${R} 0 0 1 ${gap} ${xi}V${C}`}
              strokeWidth={inner.stroke}
            />
          )}
        </svg>
      ))}
    </div>
  );
}

/** Ce qui reste de hauteur : avant le pied de page, jamais en bas. */
function Spacer() {
  return <div aria-hidden className="min-h-[0.3em] grow" />;
}

/** « : » entre l'intitulé et la valeur, dans les deux langues. */
function Colon() {
  return (
    <span aria-hidden className="px-[0.3em] font-bold">
      :
    </span>
  );
}

/**
 * Le client, ce qu'on doit lire DE LOIN (demande du client) : son nom seul,
 * très grand, centré — sans intitulé ni pictogramme. Il passe à la ligne
 * plutôt que d'être tronqué. Dessous, le téléphone et la date.
 */
function ClientBox({
  name,
  phone,
  date,
  bigDate = false,
}: {
  name: string;
  phone: string | null;
  date: string;
  bigDate?: boolean;
}) {
  return (
    <div className="rounded-[0.6em] border-[1.5px] border-black px-[0.4em] py-[0.1em] text-center">
      <bdi className="block text-[2.6em] leading-[1.1] font-bold wrap-break-word">
        {name}
      </bdi>
      <div className="flex flex-wrap items-center justify-center gap-x-[0.8em] text-[1.3em] leading-tight font-bold">
        {phone && (
          <p className="flex items-center gap-[0.3em]">
            <Phone className="size-[0.9em] shrink-0 fill-black" aria-hidden />
            <bdi dir="ltr" className="tabular">
              {phone}
            </bdi>
          </p>
        )}
        <p className="flex items-center gap-[0.3em]">
          <CalendarDays className="size-[0.9em] shrink-0" aria-hidden />
          <span className={cn("tabular", bigDate && "text-[1.25em]")}>
            {date}
          </span>
        </p>
      </div>
    </div>
  );
}

/** Pictogramme | intitulé | : | valeur — un filet gris entre les lignes. */
function DetailsTable({ details }: { details: Detail[] }) {
  return (
    // Bordures sur les CELLULES (`border-separate`) : en `border-collapse`,
    // les filets d'une ligne se chevauchaient aux jonctions des colonnes.
    <table className="mt-[0.15em] w-full border-separate border-spacing-0 text-[1.2em] leading-tight">
      <tbody>
        {details.map(({ icon: Icon, label, value }, i) => {
          // Un filet gris sous l'intitulé, le « : » et la valeur — pas sous
          // le pictogramme, ni sous la dernière ligne (maquette).
          const rule =
            i === details.length - 1
              ? ""
              : "border-b border-[#777] [print-color-adjust:exact]";
          return (
            <tr key={label}>
              <td className="w-[1.5em] py-[0.12em] pe-[0.35em] align-middle">
                <Icon className="mx-auto size-[1.15em]" aria-hidden />
              </td>
              <td
                className={cn(
                  rule,
                  "py-[0.12em] align-middle font-bold whitespace-nowrap",
                )}
              >
                {label}
              </td>
              <td className={cn(rule, "py-[0.12em] align-middle")}>
                <Colon />
              </td>
              <td
                className={cn(rule, "py-[0.12em] align-middle wrap-break-word")}
              >
                <bdi>{value}</bdi>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * Versement / Prix / Reste : DEUX colonnes séparées par un filet vertical —
 * le pictogramme et l'intitulé d'un côté, le montant de l'autre.
 */
function MoneyBox({
  rows,
}: {
  rows: { icon: IconType; label: string; value: string }[];
}) {
  return (
    // Coins échancrés, comme le cadre (maquette), en trait simple.
    // UNE grille pour les trois lignes : le filet vertical reste aligné. Les
    // colonnes ne descendent jamais sous leur contenu (`max-content`) : un
    // intitulé trop long élargit la grille, `fitTicket` voit le débordement et
    // réduit le tout — jamais un mot coupé (« التسب / يق ») ni un chevauchement.
    <div
      data-fit-box
      className="relative mt-[0.25em] grid grid-cols-[minmax(max-content,1fr)_minmax(max-content,1fr)] text-[1.35em] leading-tight font-bold"
    >
      <NotchedFrame radius={7} stroke={1.8} />
      {rows.map(({ icon: Icon, label, value }, i) => {
        const rule = i > 0 && "border-t-[1.5px] border-black";
        return (
          <Fragment key={i}>
            <div
              className={cn(
                rule,
                "flex items-center gap-[0.4em] border-e-[1.5px] border-black px-[0.45em] py-[0.08em]",
              )}
            >
              <Icon className="size-[0.95em] shrink-0" aria-hidden />
              <span className="whitespace-nowrap">{label}</span>
            </div>
            <div
              className={cn(
                rule,
                "flex items-center justify-center px-[0.4em] py-[0.08em]",
              )}
            >
              <bdi className="tabular whitespace-nowrap">{value}</bdi>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

/** La poignée de main de « Reste », au trait épaissi (silhouettes pleines). */
function HandshakeBold(props: { className?: string; "aria-hidden"?: boolean }) {
  return <Handshake strokeWidth={2.6} {...props} />;
}

/** Une phrase manuscrite entre deux filets — taille FIXE. */
function ScriptRule({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-center gap-[0.6em]", className)}>
      <span className="flex-1 border-t-[1.5px] border-black" />
      <span
        className={cn(
          SCRIPT_LATIN,
          "text-[15pt] leading-[1.15] whitespace-nowrap rtl:text-[10pt]",
        )}
      >
        {children}
      </span>
      <span className="flex-1 border-t-[1.5px] border-black" />
    </div>
  );
}

function Social({
  icon: Icon,
  children,
}: {
  icon: IconType;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-[0.3em]">
      <Icon className="size-[1.45em] shrink-0" aria-hidden />
      <span>{children}</span>
    </li>
  );
}
