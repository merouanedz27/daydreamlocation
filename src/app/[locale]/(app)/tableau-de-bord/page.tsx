import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Receipt, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Link } from "@/i18n/navigation";
import { RevenueChart, StockChart } from "@/components/dashboard-charts";
import { DashboardResult } from "@/components/dashboard-result";
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

  const [stats, unpaid] = await Promise.all([getDashboardStats(), getUnpaidOrders()]);

  const kpis = [
    { label: t("dashboard.today"), value: stats.revenue.day },
    { label: t("dashboard.thisWeek"), value: stats.revenue.week },
    { label: t("dashboard.thisMonth"), value: stats.revenue.month },
    { label: t("dashboard.thisYear"), value: stats.revenue.year },
  ];

  return (
    <div>
      {/* Titre reporté en `sr-only` : la barre de navigation dit déjà où l'on
          est. On le garde dans le DOM — un écran sans `h1` casse la navigation
          par titres des lecteurs d'écran. */}
      <div className="flex items-center justify-end gap-4">
        <h1 className="sr-only">{t("dashboard.title")}</h1>
        <Button asChild variant="outline" className="h-11">
          <Link href="/depenses">
            <Receipt className="size-4" aria-hidden />
            {t("nav.expenses")}
          </Link>
        </Button>
      </div>

      {/* 1. Recettes sur quatre périodes calendaires complètes. */}
      <section className="mt-6">
        <h2 className="sr-only">{t("dashboard.revenue")}</h2>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpis.map((k) => (
            <div key={k.label} className="border-border rounded-lg border p-4">
              <dt className="text-muted-foreground truncate text-sm">{k.label}</dt>
              <dd className="tabular mt-1 text-xl font-medium">
                {formatMoney(k.value, l)}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* 2. Le chiffre qu'il a demandé : recettes moins dépenses. */}
      <section className="mt-8">
        <h2 className="text-lg">{t("dashboard.result")}</h2>
        <div className="mt-3">
          <DashboardResult revenue={stats.revenue} expenses={stats.expenses} />
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
                <ul className="space-y-2">
                  {unpaid.map((o) => (
                    <li key={o.id}>
                      <Link
                        href={`/commandes/${o.id}`}
                        className="hover:bg-accent -mx-2 flex min-h-11 items-center gap-3 rounded-md px-2"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {o.customer_name}
                          </span>
                          <span className="text-muted-foreground block truncate text-xs">
                            <bdi>{o.order_no}</bdi>
                            {" · "}
                            <span className="tabular">{formatDate(o.event_date, l)}</span>
                          </span>
                        </span>
                        <span className="text-warning-foreground tabular shrink-0 text-sm font-medium">
                          {formatMoney(o.balance ?? 0, l)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>

                {stats.unpaid.count > unpaid.length && (
                  <p className="text-muted-foreground mt-3 flex items-center gap-1 text-xs">
                    <TrendingUp className="size-3" aria-hidden />
                    {t("dashboard.unpaidMore", {
                      count: formatNumber(stats.unpaid.count - unpaid.length, l),
                    })}
                  </p>
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
