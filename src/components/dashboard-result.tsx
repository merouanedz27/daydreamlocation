"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { formatMoney, formatNumber } from "@/lib/format";
import type { PeriodTotals, Upcoming } from "@/lib/queries/dashboard";
import type { Locale } from "@/i18n/routing";

/**
 * Recettes − dépenses = bénéfice, sur le mois ou sur l'année.
 *
 * Le chiffre que le client a demandé en propres mots. Il n'a de sens que
 * parce que l'écran Dépenses existe : sans dépenses saisies, le « bénéfice »
 * vaudrait exactement le chiffre d'affaires et mentirait.
 */
export function DashboardResult({
  revenue,
  expenses,
  upcoming,
}: {
  revenue: PeriodTotals;
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
        const exp = expenses[p.key];
        const profit = rev - exp;

        return (
          <TabsContent key={p.key} value={p.key} className="mt-4">
            <dl className="grid grid-cols-3 gap-3">
              <Figure label={t("dashboard.revenue")} value={formatMoney(rev, locale)} />
              <Figure label={t("dashboard.expenses")} value={formatMoney(exp, locale)} />
              <Figure
                label={t("dashboard.profit")}
                value={formatMoney(profit, locale)}
                /* Un bénéfice négatif doit SAUTER AUX YEUX : c'est le seul
                   chiffre de l'écran sur lequel il faut réagir. */
                tone={profit < 0 ? "bad" : "good"}
              />
            </dl>

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
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="border-border rounded-lg border p-3">
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
    </div>
  );
}
