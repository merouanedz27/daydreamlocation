import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DaySheetDate } from "@/components/day-sheet-date";
import { PrintSheet } from "@/components/print-sheet";
import { PrintToolbar } from "@/components/print-toolbar";
import { getDaySheet, type DaySheetOrder } from "@/lib/queries/day-sheet";
import { daysBetween, todayIso, type IsoDate } from "@/lib/rental-range";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ date?: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "print" });
  const date = parseDay((await props.searchParams).date);
  return { title: `${t("daySheetTitle")} ${formatDate(date, locale as Locale)}` };
}

/**
 * Une date d'URL VALIDE, sinon aujourd'hui. `2026-02-31` passe le motif mais
 * n'existe pas : on vérifie qu'elle se relit à l'identique. Un lien mal
 * recopié ne doit pas casser la feuille, seulement retomber sur le jour même.
 */
function parseDay(raw: string | undefined): IsoDate {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(`${raw}T00:00:00Z`);
    if (!Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === raw) return raw;
  }
  return todayIso();
}

/**
 * Feuille du jour — ce que le comptoir prépare et ce qu'il attend.
 *
 * Accessible à l'équipe entière : sortir les pièces du portant et récupérer
 * les retours, c'est le travail des employés. Les montants qu'elle montre
 * (reste à encaisser, caution à rendre) sont ceux de la fiche commande, que
 * les employés lisent déjà. Le coût des pièces externes n'y figure pas.
 */
export default async function DaySheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;

  const today = todayIso();
  const date = parseDay((await searchParams).date);
  const { pickups, returns } = await getDaySheet(date);

  const t = await getTranslations();

  return (
    <>
      <PrintToolbar backHref="/commandes">
        <DaySheetDate date={date} today={today} />
      </PrintToolbar>

      <PrintSheet>
        <header className="border-foreground flex flex-wrap items-baseline justify-between gap-2 border-b pb-3">
          <h1 className="font-heading text-xl font-medium">{t("print.daySheetTitle")}</h1>
          <p className="tabular text-base font-medium">{formatDate(date, l)}</p>
        </header>

        <SheetSection
          title={t("print.pickupsTitle")}
          count={formatNumber(pickups.length, l)}
          empty={t("print.noPickups")}
        >
          {pickups.map((order) => {
            const lateDays = daysBetween(order.pickup_date, date);
            const balance = order.balance ?? 0;
            return (
              <SheetOrder
                key={order.id}
                order={order}
                flag={
                  lateDays > 0
                    ? t("print.pickupPlanned", { date: formatDate(order.pickup_date, l) })
                    : null
                }
                note={t("print.eventOn", { date: formatDate(order.event_date, l) })}
                money={{
                  label: t("print.toCollect"),
                  value: balance > 0 ? formatMoney(balance, l) : t("orders.settled"),
                }}
                labels={{ size: t("stock.size") }}
              />
            );
          })}
        </SheetSection>

        <SheetSection
          title={t("print.returnsTitle")}
          count={formatNumber(returns.length, l)}
          empty={t("print.noReturns")}
        >
          {returns.map((order) => {
            const lateDays = daysBetween(order.return_due_date, date);
            const cautionDue = order.caution_amount > 0 && !order.caution_returned;
            return (
              <SheetOrder
                key={order.id}
                order={order}
                flag={
                  lateDays > 0
                    ? t("orders.lateBy", { count: formatNumber(lateDays, l) })
                    : null
                }
                note={t("print.returnPlanned", { date: formatDate(order.return_due_date, l) })}
                money={
                  cautionDue
                    ? {
                        label: t("print.cautionToReturn"),
                        value: formatMoney(order.caution_amount, l),
                      }
                    : null
                }
                labels={{ size: t("stock.size") }}
              />
            );
          })}
        </SheetSection>
      </PrintSheet>
    </>
  );
}

function SheetSection({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count: string;
  empty: string;
  children: React.ReactNode[];
}) {
  return (
    <section className="mt-6">
      {/* Le titre ne se sépare jamais de sa première commande en bas de page. */}
      <h2 className="flex break-after-avoid items-baseline gap-2 text-base font-medium">
        {title}
        <span className="tabular text-muted-foreground text-sm font-normal">{count}</span>
      </h2>
      {children.length === 0 ? (
        <p className="text-muted-foreground mt-2">{empty}</p>
      ) : (
        <ul className="mt-2">{children}</ul>
      )}
    </section>
  );
}

/**
 * Une commande de la feuille. Une case VIDE en tête, à cocher au stylo :
 * la feuille sert au comptoir, loin du téléphone.
 */
function SheetOrder({
  order,
  flag,
  note,
  money,
  labels,
}: {
  order: DaySheetOrder;
  /** Retard : écrit en toutes lettres, jamais porté par la seule couleur. */
  flag: string | null;
  note: string;
  money: { label: string; value: string } | null;
  labels: { size: string };
}) {
  return (
    <li className="border-border flex break-inside-avoid gap-3 border-b py-3">
      <span className="border-foreground mt-1 size-4 shrink-0 border" aria-hidden />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <p className="font-medium">{order.customer_name}</p>
          {order.customer_phone && (
            <bdi dir="ltr" className="tabular">
              {order.customer_phone}
            </bdi>
          )}
          <bdi className="text-muted-foreground text-xs">{order.order_no}</bdi>
          {flag && (
            <span className="border-foreground border px-1.5 text-xs font-medium">{flag}</span>
          )}
        </div>
        <p className="text-muted-foreground mt-0.5 text-xs">{note}</p>

        {/* Référence EN PREMIER : c'est ce qu'on lit sur l'étiquette du cintre. */}
        <ul className="mt-1.5 space-y-0.5">
          {order.order_lines.map((line) => (
            <li key={line.id} className="flex flex-wrap gap-x-2">
              {line.article_units && (
                <bdi className="tabular font-medium">{line.article_units.ref_code}</bdi>
              )}
              <span>{line.model_name_snapshot ?? line.external_label}</span>
              {line.size_snapshot && (
                <span className="text-muted-foreground">{`${labels.size} ${line.size_snapshot}`}</span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {money && (
        <div className="shrink-0 text-end">
          <p className="text-muted-foreground text-xs">{money.label}</p>
          <p className="tabular font-medium">{money.value}</p>
        </div>
      )}
    </li>
  );
}
