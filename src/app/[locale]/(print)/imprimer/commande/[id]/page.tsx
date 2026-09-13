import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PrintSheet } from "@/components/print-sheet";
import { PrintToolbar } from "@/components/print-toolbar";
import { getOrder, getSettings } from "@/lib/queries/orders";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/routing";
import ddLogo from "../../../../../../../public/dd-logo.png";

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
 * Bon de location d'une commande — le document remis ou envoyé au client.
 *
 * CE QUI N'Y FIGURE JAMAIS
 * - Le coût payé au confrère pour une pièce externe, ni le nom du confrère :
 *   c'est la marge de la boutique, pas l'affaire du client.
 * - La note de la commande : elle est interne (« client difficile », « a
 *   payé en deux fois »). La fiche la range d'ailleurs dans sa propre carte.
 */
export default async function OrderSlipPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;

  const [order, settings] = await Promise.all([getOrder(Number(id)), getSettings()]);
  if (!order) notFound();

  const t = await getTranslations();

  // `?? null` : tant que la migration des coordonnées n'est pas appliquée, ces
  // colonnes n'existent pas — le bon s'imprime alors sans elles.
  const address = settings.shop_address ?? null;
  const shopPhone = settings.shop_phone ?? null;
  const terms = (l === "ar" ? settings.rental_terms_ar : settings.rental_terms_fr) ?? null;

  const balance = order.balance ?? 0;
  const cancelled = order.status === "annulee";

  return (
    <>
      <PrintToolbar backHref={`/commandes/${order.id}`} hint={t("print.pdfHint")} />

      <PrintSheet>
        {/* --- En-tête : la boutique d'un côté, le document de l'autre ------- */}
        <header className="border-foreground flex items-start justify-between gap-6 border-b pb-5">
          <div className="min-w-0">
            {/* `print-color-adjust: exact` sur le LOGO SEUL : sans lui, Chrome
                « économise l'encre » et délave le brun du logo. Le reste du
                bon est déjà en encre, il n'en a pas besoin. */}
            <Image
              src={ddLogo}
              alt={t("app.name")}
              priority
              sizes="144px"
              className="h-auto w-36 [print-color-adjust:exact]"
            />
            {(address || shopPhone) && (
              <div className="text-muted-foreground mt-2 space-y-0.5 text-xs">
                {address && <p className="whitespace-pre-line">{address}</p>}
                {shopPhone && (
                  <p>
                    <bdi dir="ltr" className="tabular">
                      {shopPhone}
                    </bdi>
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="shrink-0 text-end">
            <h1 className="font-heading text-xl font-medium">{t("print.slipTitle")}</h1>
            <p className="mt-1 text-base font-medium">
              <bdi>{order.order_no}</bdi>
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              {t("print.issuedOn", { date: formatDate(order.created_at, l) })}
            </p>
          </div>
        </header>

        {/* Un bon d'une commande annulée reste imprimable — pour le dossier —
            mais ne doit JAMAIS pouvoir passer pour un bon valable. Le mot le
            dit, en encre et encadré : pas de rouge seul, qui disparaît sur
            une impression noir et blanc. */}
        {cancelled && (
          <p className="border-foreground mt-5 border-2 px-4 py-2 text-center text-base font-medium">
            {t("print.cancelled")}
          </p>
        )}

        {/* --- Client et dates -------------------------------------------- */}
        <section className="mt-5 grid gap-4 sm:grid-cols-2 print:grid-cols-2">
          <div>
            <h2 className="text-muted-foreground text-xs">{t("orders.customer")}</h2>
            <p className="mt-1 text-base font-medium">{order.customer_name}</p>
            {order.customer_phone && (
              <p className="mt-0.5">
                <bdi dir="ltr" className="tabular">
                  {order.customer_phone}
                </bdi>
              </p>
            )}
          </div>

          <dl className="grid grid-cols-3 gap-2">
            {(
              [
                ["orders.pickupDate", order.pickup_date],
                ["orders.event", order.event_date],
                ["orders.returnDate", order.return_due_date],
              ] as const
            ).map(([label, date]) => (
              <div key={label}>
                <dt className="text-muted-foreground text-xs">{t(label)}</dt>
                <dd
                  className={cn("tabular mt-1", label === "orders.event" && "font-medium")}
                >
                  {formatDate(date, l)}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* --- Pièces ----------------------------------------------------- */}
        <table className="mt-6 w-full border-collapse">
          <thead>
            <tr className="border-foreground border-b text-xs">
              <th className="py-2 pe-3 text-start font-medium">{t("print.designation")}</th>
              <th className="py-2 pe-3 text-start font-medium">{t("stock.reference")}</th>
              <th className="py-2 pe-3 text-start font-medium">{t("stock.size")}</th>
              <th className="py-2 text-end font-medium">{t("orders.linePrice")}</th>
            </tr>
          </thead>
          <tbody>
            {order.order_lines.map((line) => (
              <tr key={line.id} className="border-border break-inside-avoid border-b">
                <td className="py-2 pe-3 align-top">
                  {line.model_name_snapshot ?? line.external_label}
                </td>
                <td className="py-2 pe-3 align-top">
                  {line.article_units ? <bdi>{line.article_units.ref_code}</bdi> : null}
                </td>
                <td className="tabular py-2 pe-3 align-top">{line.size_snapshot}</td>
                <td className="tabular py-2 text-end align-top">
                  {formatMoney(line.unit_price, l)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* --- Montants, puis la caution À PART ---------------------------- */}
        <section className="mt-5 flex break-inside-avoid flex-wrap items-start justify-between gap-4">
          {/* La caution n'est ni le prix ni un versement : de l'argent DÉTENU,
              rendu au retour. Elle a son cadre, comme sur la fiche — la mêler
              aux montants est l'erreur que le tableur faisait. */}
          <div className="border-border min-w-48 rounded-sm border px-4 py-3">
            <p className="text-muted-foreground text-xs">{t("orders.caution")}</p>
            <p className="tabular mt-1 text-base font-medium">
              {formatMoney(order.caution_amount, l)}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              {order.caution_returned
                ? t("orders.cautionReturned")
                : t("print.cautionNotIncluded")}
            </p>
          </div>

          <dl className="ms-auto w-full max-w-72 space-y-1.5">
            {order.discount > 0 && (
              <>
                <SlipAmount label={t("orders.subtotal")} value={formatMoney(order.subtotal, l)} />
                <SlipAmount
                  label={t("orders.discount")}
                  value={`− ${formatMoney(order.discount, l)}`}
                />
              </>
            )}
            <SlipAmount
              label={t("orders.total")}
              value={formatMoney(order.total_price, l)}
              strong
            />
            <SlipAmount label={t("orders.paid")} value={formatMoney(order.amount_paid, l)} />
            <div className="border-foreground border-t pt-1.5">
              <SlipAmount
                label={balance < 0 ? t("orders.toRefund") : t("orders.balance")}
                value={balance === 0 ? t("orders.settled") : formatMoney(Math.abs(balance), l)}
                strong
              />
            </div>
          </dl>
        </section>

        {/* --- Conditions : le texte du propriétaire, dans la langue du bon -- */}
        {terms && (
          <section className="border-border mt-6 break-inside-avoid border-t pt-4">
            <h2 className="text-xs font-medium">{t("print.conditions")}</h2>
            <p className="text-muted-foreground mt-2 text-xs leading-relaxed whitespace-pre-line">
              {terms}
            </p>
          </section>
        )}

        {/* --- Signatures ------------------------------------------------- */}
        <section className="mt-8 grid break-inside-avoid grid-cols-2 gap-8">
          {[t("print.customerSignature"), t("print.shopSignature")].map((label) => (
            <div key={label}>
              <p className="text-muted-foreground text-xs">{label}</p>
              {/* La ligne où l'on signe : un vrai espace vide, pas un filet
                  collé au libellé. */}
              <div className="border-foreground mt-14 border-b" />
            </div>
          ))}
        </section>
      </PrintSheet>
    </>
  );
}

function SlipAmount({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={cn(strong ? "font-medium" : "text-muted-foreground")}>{label}</dt>
      <dd className={cn("tabular text-end", strong && "text-base font-medium")}>{value}</dd>
    </div>
  );
}
