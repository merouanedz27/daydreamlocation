"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { formatMoney, formatNumber } from "@/lib/format";
import type { PeriodTotals, Upcoming } from "@/lib/queries/dashboard";
import type { Locale } from "@/i18n/routing";

/**
 * Locations − frais = bénéfice, sur le mois ou sur l'année.
 *
 * « Locations » est la somme des prix des commandes, remplis à partir des prix
 * de LOCATION du stock. Les frais sont ceux que l'équipe note dans l'onglet
 * « Frais » (tailleur, pressing…). Le chiffre d'affaires, lui, est ailleurs :
 * c'est la valeur d'ACHAT du stock, sans période.
 */
export function DashboardResult({
  revenue,
  sales,
  salesCost,
  expenses,
  upcoming,
}: {
  /** Locations + ventes. */
  revenue: PeriodTotals;
  /** La part des ventes dans `revenue`. */
  sales: PeriodTotals;
  /** Prix d'achat des paires vendues : ce que la vente a « consommé » du stock. */
  salesCost: PeriodTotals;
  expenses: PeriodTotals;
  upcoming: Upcoming;
}) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();

  const periods = [
    { key: "month" as const, label: t("dashboard.thisMonth") },
    { key: "year" as const, label: t("dashboard.thisYear") },
  ];

  return (
    <Tabs defaultValue="month">
      <TabsList>
        {periods.map((p) => (
          <TabsTrigger key={p.key} value={p.key}>
            {p.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {periods.map((p) => {
        const rev = revenue[p.key];
        const sold = sales[p.key];
        const soldCost = salesCost[p.key];
        const exp = expenses[p.key];
        // Une paire vendue n'est pas un gain net : ce qu'elle avait coûté
        // sort du bénéfice. Une location, elle, ne consomme pas le stock.
        const profit = rev - soldCost - exp;

        return (
          <TabsContent key={p.key} value={p.key} className="mt-4">
            {/* Les ventes À PART (locations | ventes), puis FONDUES dans le
                total et le bénéfice — les deux lectures que veut le patron. */}
            <dl className="grid grid-cols-2 gap-3">
              <Figure label={t("dashboard.rentals")} value={formatMoney(rev - sold, locale)} />
              <Figure
                label={t("dashboard.sales")}
                value={formatMoney(sold, locale)}
                note={
                  sold > 0
                    ? t("dashboard.salesMargin", { amount: formatMoney(sold - soldCost, locale) })
                    : undefined
                }
              />
              <Figure label={t("dashboard.totalIn")} value={formatMoney(rev, locale)} wide />
              <Figure label={t("dashboard.expenses")} value={formatMoney(exp, locale)} />
              <Figure
                label={t("dashboard.profit")}
                value={formatMoney(profit, locale)}
                /* Un bénéfice négatif doit SAUTER AUX YEUX : c'est le seul
                   chiffre de l'écran sur lequel il faut réagir. */
                tone={profit < 0 ? "bad" : "good"}
              />
            </dl>

            {soldCost > 0 && (
              <p className="text-muted-foreground mt-3 text-xs">
                {t("dashboard.profitWithSalesHint", { cost: formatMoney(soldCost, locale) })}
              </p>
            )}

            {/* UN ZÉRO DOIT S'EXPLIQUER. « Ce mois : 0 » à côté de
                « Cette année : 11 300 » s'est lu comme une panne, alors que
                les deux chiffres étaient justes : les mariages du registre
                tombent tous en décembre. La recette se compte à la date de
                RETRAIT, et c'est ce que cette phrase dit — sans quoi le patron
                doute de l'écran et retourne à son tableur. */}
            {rev === 0 && upcoming.count > 0 && (
              <p className="text-muted-foreground mt-3 text-xs">
                {t("dashboard.noRevenueYet", {
                  // En chaîne déjà formatée : un nombre brut passé à ICU
                  // s'écrirait en chiffres arabes-indiens côté `ar`, alors que
                  // tout le produit affiche des chiffres latins.
                  count: formatNumber(upcoming.count, locale),
                  total: formatMoney(upcoming.total, locale),
                })}
              </p>
            )}

            {exp === 0 && rev > 0 && (
              <p className="text-muted-foreground mt-3 text-xs">
                {t("dashboard.noExpensesYet")}
              </p>
            )}
          </TabsContent>
        );
      })}
    </Tabs>
  );
}

function Figure({
  label,
  value,
  tone,
  note,
  wide,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
  /** Une précision sous le chiffre (la marge des ventes). */
  note?: string;
  /** Toute la largeur : le total, entre le détail et le résultat. */
  wide?: boolean;
}) {
  return (
    <div className={cn("border-border rounded-lg border p-3", wide && "bg-gold-soft/40 col-span-2")}>
      <dt className="text-muted-foreground truncate text-xs">{label}</dt>
      <dd
        className={cn(
          "tabular mt-1 font-medium",
          tone === "good" && "text-success-foreground",
          tone === "bad" && "text-destructive",
        )}
      >
        {value}
      </dd>
      {note && <p className="text-muted-foreground mt-0.5 truncate text-xs">{note}</p>}
    </div>
  );
}
