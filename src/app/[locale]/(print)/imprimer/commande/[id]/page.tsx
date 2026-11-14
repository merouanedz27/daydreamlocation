import type { Metadata } from "next";
import Image from "next/image";
import { Great_Vibes } from "next/font/google";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  CalendarDays,
  Coins,
  Handshake,
  IdCard,
  Phone,
  Ruler,
  Scissors,
  Shirt,
  Tag,
  TriangleAlert,
  User,
} from "lucide-react";
import { PrintToolbar } from "@/components/print-toolbar";
import { TicketActions } from "@/components/ticket-share";
import { TicketFrame } from "@/components/ticket-fit";
import { TicketPdfProvider } from "@/components/ticket-pdf";
import { OrderQr } from "@/components/order-qr";
import {
  BowTieIcon,
  FacebookIcon,
  HangerIcon,
  InstagramIcon,
  JacketIcon,
  ShoeIcon,
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
      // Une paire VENDUE ne figure pas sur le bon : il dit ce qui doit revenir.
      order_lines: order.order_lines.filter(
        (line) => line.is_active && line.line_kind !== "vente",
      ),
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
      { icon: Ruler, label: tt("size"), value: size },
      { icon: TrousersIcon, label: tt("pantsSize"), value: fields.pantsSize },
      { icon: Scissors, label: tt("tailor"), value: fields.tailor },
      { icon: Shirt, label: tt("shirt"), value: fields.shirt },
      { icon: JacketIcon, label: tt("jabador"), value: fields.jabador },
      { icon: ShoeIcon, label: tt("shoes"), value: fields.shoes },
      { icon: BowTieIcon, label: tt("accessories"), value: fields.accessories },
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
    // QR à GAUCHE, sur un bon arabe aussi (`dir="ltr"`).
    <header
      dir="ltr"
      className="mx-[0.8em] flex items-center gap-[0.8em] border-b-[1.5px] border-black pt-[0.8em] pb-[0.6em]"
    >
      <OrderQr value={orderUrl} className="block size-[5.6em] shrink-0" />
      <span aria-hidden className="w-[1.5px] self-stretch bg-black" />
      <div className="flex min-w-0 flex-1 flex-col items-center">
        {/* `unoptimized` : le logo servi par SON fichier (cache de
            html-to-image) ; `priority` : chargé avant l'impression. */}
        <Image
          src={logo}
          alt={t("app.name")}
          priority
          unoptimized
          className="h-auto w-full max-w-[17em] [print-color-adjust:exact]"
        />
        <p
          className={cn(
            SCRIPT,
            "mt-[0.2em] text-[1.35em] leading-none whitespace-nowrap",
          )}
        >
          {tt("tagline")}
        </p>
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

  const body = (
    <div className="px-[0.8em] pt-[0.6em]">
      <ClientBox
        labels={{ client: tt("client"), phone: tt("phone"), date: tt("date") }}
        name={order.customer_name}
        phone={order.customer_phone}
        date={eventDate}
      />
      <PillRule className="mt-[0.7em]">{tt("details")}</PillRule>
      <DetailsTable details={details} />
      <MoneyBox
        rows={[
          {
            icon: Tag,
            label: tt("paid"),
            value: formatMoney(order.amount_paid, l),
          },
          {
            icon: Coins,
            label: tt("price"),
            value: formatMoney(order.total_price, l),
          },
          {
            icon: Handshake,
            label: balance < 0 ? t("orders.toRefund") : tt("rest"),
            value: formatMoney(Math.abs(balance), l),
          },
        ]}
      />
    </div>
  );

  const footer = (
    <>
      <Spacer />
      <footer className="px-[0.8em] pb-[0.5em]">
        {/* Tailles PLAFONNÉES : sur une commande d'une seule pièce, `--fit`
            grimpe à 2,2 et ces lignes sans retour sortaient de l'étiquette. */}
        <ScriptRule>{tt("socials")}</ScriptRule>
        <ul
          dir="ltr"
          className="mt-[0.3em] flex items-center justify-center-safe gap-[0.5em] text-[min(0.78em,8.5pt)] whitespace-nowrap"
        >
          <Social icon={InstagramIcon}>{SHOP_SOCIALS.instagram}</Social>
          <li aria-hidden className="h-[1.2em] w-[1.5px] bg-black" />
          <Social icon={TiktokIcon}>{SHOP_SOCIALS.tiktok}</Social>
          <li aria-hidden className="h-[1.2em] w-[1.5px] bg-black" />
          <Social icon={FacebookIcon}>{SHOP_SOCIALS.facebook}</Social>
        </ul>
        <ScriptRule className="mt-[0.35em]" large>
          {tt("thanks")}
        </ScriptRule>
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
      <div className={cn(script.variable, "space-y-4 print:space-y-0")}>
        {/* --- BON DE LOCATION — copie du magasin --------------------------- */}
        <TicketFrame index={0}>
          <TicketCard>
            {header}
            {cancelledBanner}

            {/* Conditions de location, centrées, en arabe. */}
            <section
              lang="ar"
              dir="rtl"
              className="mx-[0.8em] mt-[0.5em] text-center font-[family-name:var(--font-cairo)] leading-[1.45] font-bold"
            >
              <h2 className="flex items-center justify-center gap-[0.4em] text-[1.15em] font-extrabold">
                <TriangleAlert className="size-[1.05em] shrink-0" aria-hidden />
                <span>{tt("idRequired")}</span>
                <IdCard className="size-[1.15em] shrink-0" aria-hidden />
                <TriangleAlert className="size-[1.05em] shrink-0" aria-hidden />
              </h2>
              {terms.map((term, i) => (
                <p key={i} className="mt-[0.15em] text-[0.95em]">
                  {term}
                </p>
              ))}
            </section>

            {body}
            {footer}
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
            {body}
            {footer}

            {/* PARTIE RETOUCHE — détachée le long des pointillés et donnée au
                tailleur avec le pantalon. Une par retouche. */}
            {/* Taille FIXE, hors de `--fit` : sans elle, une commande d'une
                seule pièce agrandissait tout le ticket — et cette partie avec.
                Elle garde la même hauteur quel que soit le reste ; c'est le
                haut du ticket qui s'ajuste autour d'elle. */}
            {alterations.map((a) => (
              <section
                key={a.id}
                style={{ fontSize: "7.5pt" }}
                className="px-[1em] pb-[0.5em]"
              >
                <div className="relative -mx-[1em] flex items-center gap-[0.4em]">
                  <Scissors
                    className="ms-[0.5em] size-[1.1em] shrink-0"
                    aria-hidden
                  />
                  <span className="flex-1 border-t-[1.5px] border-dashed border-black" />
                  <span className="text-[0.68em] font-bold tracking-[0.12em] uppercase">
                    {tt("alterationPart")}
                  </span>
                  <span className="w-[1em] border-t-[1.5px] border-dashed border-black" />
                </div>

                <div className="mt-[0.35em] flex items-stretch gap-[0.6em]">
                  {/* Ce que disait l'ancienne étiquette, DANS le cadre : le
                      client, la pièce, sa taille et la date, puis la retouche. */}
                  <div className="flex min-w-0 flex-1 flex-col justify-center gap-[0.05em] border-[1.5px] border-black px-[0.6em] py-[0.3em] leading-tight">
                    <p className="text-[0.68em] font-semibold tracking-[0.16em] uppercase">
                      {tt("alteration")}
                    </p>
                    <p className="truncate text-start text-[1.15em] font-bold">
                      <bdi>{order.customer_name}</bdi>
                    </p>
                    {a.name && (
                      // « Tuxedo A · Pantalon » : la retouche est toujours sur
                      // le pantalon — dit une fois, même si le nom le porte.
                      <p className="truncate text-start text-[0.9em]">
                        <bdi>{a.name}</bdi>
                        {!a.name
                          .toLowerCase()
                          .includes(tt("pants").toLowerCase()) &&
                          ` · ${tt("pants")}`}
                      </p>
                    )}
                    <p className="flex items-baseline gap-x-[0.6em]">
                      {a.size && (
                        <span className="text-[1.05em] font-bold">
                          {t("alterations.size", { size: a.size })}
                        </span>
                      )}
                      <span className="tabular font-bold">{eventDate}</span>
                    </p>
                    <p className="flex min-w-0 items-start gap-[0.35em] text-start font-bold">
                      <Scissors
                        className="mt-[0.15em] size-[1em] shrink-0"
                        aria-hidden
                      />
                      <bdi className="line-clamp-2 min-w-0 wrap-break-word">
                        {a.note}
                      </bdi>
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-center justify-center gap-[0.1em] border-[1.5px] border-black p-[0.25em]">
                    {/* 0,65 pouce FIXE : c'est lui qui donne sa hauteur à la
                        partie (collée au pantalon, elle doit rester petite),
                        et il se scanne encore au téléphone du tailleur. */}
                    <OrderQr
                      value={alterationUrl(appUrl(), locale, a.id)}
                      className="block size-[0.65in]"
                    />
                    <span className="text-[0.65em] font-bold tracking-[0.14em] uppercase">
                      {tt("scan")}
                    </span>
                  </div>
                </div>
              </section>
            ))}
          </TicketCard>
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

/** Le cadre noir du ticket, aux coins arrondis, étiré jusqu'au bas. */
function TicketCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex grow flex-col rounded-[0.9em] border-[1.5px] border-black">
      {children}
    </div>
  );
}

/** Ce qui reste de hauteur : avant le pied de page, jamais en bas. */
function Spacer() {
  return <div aria-hidden className="min-h-[0.6em] grow" />;
}

/** « : » entre l'intitulé et la valeur, dans les deux langues. */
function Colon() {
  return (
    <span aria-hidden className="px-[0.3em] font-bold">
      :
    </span>
  );
}

function ClientBox({
  labels,
  name,
  phone,
  date,
}: {
  labels: { client: string; phone: string; date: string };
  name: string;
  phone: string | null;
  date: string;
}) {
  return (
    <div className="rounded-[0.8em] border-[1.5px] border-black px-[0.7em] py-[0.35em]">
      <p className="flex items-center gap-[0.5em] text-[1.35em] leading-tight font-bold">
        <User className="size-[0.9em] shrink-0 fill-black" aria-hidden />
        <span className="shrink-0">
          {labels.client}
          <Colon />
        </span>
        <bdi className="min-w-0 truncate">{name}</bdi>
      </p>
      <div className="mt-[0.2em] flex items-center gap-[0.5em] font-bold">
        <p className="flex min-w-0 flex-1 items-center gap-[0.45em]">
          <Phone className="size-[1.1em] shrink-0 fill-black" aria-hidden />
          <span className="shrink-0">
            {labels.phone}
            <Colon />
          </span>
          {phone && (
            <bdi dir="ltr" className="tabular truncate">
              {phone}
            </bdi>
          )}
        </p>
        <span aria-hidden className="h-[1.3em] w-[1.5px] shrink-0 bg-black" />
        <p className="flex shrink-0 items-center gap-[0.45em]">
          <CalendarDays className="size-[1.1em] shrink-0" aria-hidden />
          <span>
            {labels.date}
            <Colon />
          </span>
          <span className="tabular">{date}</span>
        </p>
      </div>
    </div>
  );
}

/** Le bandeau noir arrondi au milieu d'un filet : « DÉTAILS DE LA LOCATION ». */
function PillRule({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-center", className)}>
      <span className="flex-1 border-t-[1.5px] border-black" />
      <span className="rounded-full bg-black px-[1.4em] py-[0.15em] text-[1.05em] font-bold tracking-[0.04em] text-white uppercase [print-color-adjust:exact] rtl:tracking-normal">
        {children}
      </span>
      <span className="flex-1 border-t-[1.5px] border-black" />
    </div>
  );
}

/** Pictogramme | intitulé | : | valeur — séparés en pointillés. */
function DetailsTable({ details }: { details: Detail[] }) {
  return (
    // Bordures sur les CELLULES (`border-separate`) : en `border-collapse`,
    // les pointillés d'une ligne se chevauchaient aux jonctions des colonnes.
    <table className="mt-[0.3em] w-full border-separate border-spacing-0">
      <tbody>
        {details.map(({ icon: Icon, label, value }, i) => {
          const rule =
            i === details.length - 1
              ? ""
              : // Pointillés dessinés en fond, continus d'une cellule à
                // l'autre (une bordure `dotted` marquait chaque jonction).
                "bg-[linear-gradient(to_right,#000_1px,transparent_1px)] bg-[length:3px_1px] bg-bottom bg-repeat-x [print-color-adjust:exact]";
          return (
            <tr key={label}>
              <td className="w-[2.2em] py-[0.25em] pe-[0.5em] align-middle">
                <Icon className="mx-auto size-[1.5em]" aria-hidden />
              </td>
              <td
                className={cn(
                  rule,
                  "py-[0.3em] align-middle font-bold whitespace-nowrap",
                )}
              >
                {label}
              </td>
              <td className={cn(rule, "py-[0.3em] align-middle")}>
                <Colon />
              </td>
              <td
                className={cn(
                  rule,
                  "py-[0.3em] align-middle leading-snug wrap-break-word",
                )}
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

/** Versement / Prix / Reste : l'intitulé à gauche, le montant à droite. */
function MoneyBox({
  rows,
}: {
  rows: { icon: IconType; label: string; value: string }[];
}) {
  return (
    <div className="mt-[0.5em] overflow-hidden rounded-[0.8em] border-[1.5px] border-black">
      {rows.map(({ icon: Icon, label, value }, i) => (
        <div
          key={i}
          className={cn(
            "grid grid-cols-[1.15fr_1fr] items-stretch",
            i > 0 && "border-t-[1.5px] border-black",
          )}
        >
          <div
            className={cn(
              "flex items-center gap-[0.7em] border-e-[1.5px] border-black px-[0.8em] py-[0.2em] text-[1.15em] font-bold",
              // Le versement en tête, sur fond noir, comme sur la maquette.
              i === 0 &&
                "bg-black text-white uppercase [print-color-adjust:exact]",
            )}
          >
            <Icon className="size-[1.2em] shrink-0" aria-hidden />
            <span className="min-w-0 truncate">{label}</span>
          </div>
          <p className="flex items-center gap-[0.4em] px-[0.6em] py-[0.2em] text-[1.25em] font-bold">
            <Colon />
            <bdi className="tabular flex-1 text-center whitespace-nowrap">
              {value}
            </bdi>
          </p>
        </div>
      ))}
    </div>
  );
}

/** Une phrase manuscrite entre deux filets. */
function ScriptRule({
  className,
  large,
  children,
}: {
  className?: string;
  large?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-center gap-[0.6em]", className)}>
      <span className="flex-1 border-t-[1.5px] border-black" />
      <span
        className={cn(
          SCRIPT_LATIN,
          "leading-[1.15] whitespace-nowrap",
          large
            ? "text-[min(2.1em,26pt)] rtl:text-[min(1.35em,16pt)]"
            : "text-[min(1.6em,20pt)] rtl:text-[min(1.1em,13pt)]",
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
