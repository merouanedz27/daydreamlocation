import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarClock } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { RevenueChart, StockChart } from "@/components/dashboard-charts";
import { DashboardResult } from "@/components/dashboard-result";
import { UnpaidList } from "@/components/unpaid-list";
import { requireOwner } from "@/lib/auth";
import { getDashboardStats, getUnpaidOrders } from "@/lib/queries/dashboard";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "dashboard" });
  return { title: t("title") };
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Le tableau de bord financier ne regarde pas l'équipe.
  await requireOwner(locale as Locale);

  const t = await getTranslations();
  const l = locale as Locale;

  const [stats, unpaid] = await Promise.all([getDashboardStats(), getUnpaidOrders(null)]);

  const kpis = [
    { label: t("dashboard.thisWeek"), value: stats.revenue.week },
    { label: t("dashboard.thisMonth"), value: stats.revenue.month },
    { label: t("dashboard.thisYear"), value: stats.revenue.year },
  ];

  return (
    <div>
      {/* Titre reporté en `sr-only` : la barre de navigation dit déjà où l'on
          est. On le garde dans le DOM — un écran sans `h1` casse la navigation
          par titres des lecteurs d'écran. */}
      <h1 className="sr-only">{t("dashboard.title")}</h1>

      {/* 0. Le chiffre d'affaires TEL QUE LE PROPRIÉTAIRE LE COMPTE : ce que
          le stock lui a coûté. Un total, sans période — il l'a voulu ainsi. */}
      <section className="border-gold-strong/40 bg-gold-soft/40 rounded-lg border p-4">
        <h2 className="text-muted-foreground text-sm">{t("dashboard.turnover")}</h2>
        <p className="tabular mt-1 text-2xl font-medium">
          {formatMoney(stats.stockValue.total, l)}
        </p>
        <p className="text-muted-foreground mt-1 text-xs">
          {t("dashboard.turnoverHint", {
            count: formatNumber(stats.stockValue.pieces, l),
          })}
        </p>
      </section>

      {/* 1. La CAISSE du jour, telle que le patron la compte : les acomptes
          pris aujourd'hui + les restes soldés aujourd'hui, toutes commandes
          confondues (journal `order_payments`). */}
      <section className="mt-8">
        <h2 className="text-lg">{t("dashboard.cashTitle")}</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3">
          <div className="border-border rounded-lg border p-4">
            <dt className="text-muted-foreground truncate text-sm">{t("dashboard.paidToday")}</dt>
            <dd className="tabular mt-1 text-xl font-medium">
              {formatMoney(stats.cashToday.versement, l)}
            </dd>
          </div>
          <div className="border-border rounded-lg border p-4">
            <dt className="text-muted-foreground truncate text-sm">{t("dashboard.restToday")}</dt>
            <dd className="tabular mt-1 text-xl font-medium">
              {formatMoney(stats.cashToday.reste, l)}
            </dd>
          </div>
          <div className="border-gold-strong/40 bg-gold-soft/40 col-span-2 rounded-lg border p-4">
            <dt className="text-muted-foreground truncate text-sm">{t("dashboard.cashToday")}</dt>
            <dd className="tabular mt-1 text-2xl font-medium">
              {formatMoney(stats.cashToday.versement + stats.cashToday.reste, l)}
            </dd>
          </div>
        </dl>
        {stats.cashToday.since && (
          <p className="text-muted-foreground mt-2 text-xs">
            {t("dashboard.cashHint", { date: formatDate(stats.cashToday.since, l) })}
          </p>
        )}
      </section>

      {/* 2. Locations sur trois périodes calendaires complètes. */}
      <section className="mt-8">
        <h2 className="text-lg">{t("dashboard.revenue")}</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
          {kpis.map((k) => (
            // Trois cartes sur deux colonnes : la dernière prend la ligne entière.
            <div
              key={k.label}
              className="border-border rounded-lg border p-4 last:col-span-2 lg:last:col-span-1"
            >
              <dt className="text-muted-foreground truncate text-sm">{k.label}</dt>
              <dd className="tabular mt-1 text-xl font-medium">
                {formatMoney(k.value, l)}
              </dd>
            </div>
          ))}
        </dl>

        {/* CE QUI RÉPOND AU « POURQUOI 0 ? ».
            Les cartes ci-dessus ne comptent que ce qui SORT du magasin
            pendant la période. Un registre entièrement fait de mariages de
            décembre affiche donc des zéros en septembre, tout en étant
            parfaitement juste — et ressemble à un écran cassé.
            Cette ligne dit ce qui est déjà réservé. Elle reste SÉPARÉE des
            cartes et ne s'additionne à aucune : ce n'est pas encore du chiffre
            d'affaires, et l'annoncer comme tel serait le mensonge inverse. */}
        {stats.upcoming.count > 0 && (
          <p className="border-border bg-gold-soft/40 text-foreground mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg border px-4 py-3 text-sm">
            <CalendarClock className="text-gold-strong size-4 self-center" aria-hidden />
            <span className="font-medium">{t("dashboard.upcomingTitle")}</span>
            <span className="tabular">
              {t("dashboard.upcomingCount", {
                count: formatNumber(stats.upcoming.count, l),
              })}
              {" — "}
              {formatMoney(stats.upcoming.total, l)}
            </span>
            {stats.upcoming.nextDate && (
              <span className="text-muted-foreground">
                {t("dashboard.upcomingNext", {
                  date: formatDate(stats.upcoming.nextDate, l),
                })}
              </span>
            )}
          </p>
        )}
      </section>

      {/* 2. Le bénéfice : locations moins frais. */}
      <section className="mt-8">
        <h2 className="text-lg">{t("dashboard.result")}</h2>
        <div className="mt-3">
          <DashboardResult
            revenue={stats.revenue}
            expenses={stats.expenses}
            upcoming={stats.upcoming}
          />
        </div>
      </section>

      {/* 3. Douze mois d'historique. */}
      <section className="mt-8">
        <h2 className="text-lg">{t("dashboard.twelveMonths")}</h2>
        <div className="border-border mt-3 rounded-lg border p-3">
          <RevenueChart monthly={stats.monthly} />
        </div>
      </section>

      <div className="mt-8 grid gap-8 md:grid-cols-2">
        {/* 4. État du stock aujourd'hui. */}
        <section>
          <h2 className="text-lg">{t("dashboard.stockState")}</h2>
          <div className="border-border mt-3 rounded-lg border p-4">
            <StockChart stock={stats.stock} />
          </div>
        </section>

        {/* 5. Qui doit de l'argent. */}
        <section>
          <h2 className="text-lg">{t("dashboard.unpaid")}</h2>

          <div className="border-border mt-3 rounded-lg border p-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="tabular text-xl font-medium">
                {formatMoney(stats.unpaid.total, l)}
              </p>
              <p className="text-muted-foreground text-sm">
                {t("dashboard.unpaidCount", {
                  count: formatNumber(stats.unpaid.count, l),
                })}
              </p>
            </div>

            {unpaid.length === 0 ? (
              <p className="text-muted-foreground mt-4 text-sm">
                {t("dashboard.allPaid")}
              </p>
            ) : (
              <>
                <Separator className="my-4" />
                <UnpaidList orders={unpaid} locale={l} />
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
