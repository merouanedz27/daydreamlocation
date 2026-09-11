"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatMoney, formatNumber } from "@/lib/format";
import type { MonthlyPoint, StockState } from "@/lib/queries/dashboard";
import type { Locale } from "@/i18n/routing";

/**
 * POURQUOI `dir="ltr"` SUR LES GRAPHIQUES, MÊME EN ARABE
 *
 * Recharts ne miroite pas ses axes — et il ne le doit pas ici. Un axe de temps
 * se lit de gauche à droite dans les deux langues : miroiter mettrait décembre
 * à gauche et janvier à droite, ce qui est un contresens, pas une adaptation.
 * Les chiffres sont déjà latins dans les deux langues (`ar-DZ-u-nu-latn`,
 * cf. `src/lib/format.ts`). Seuls les LIBELLÉS autour du graphique suivent le
 * sens de la page. Voir `daydream-ui`.
 */

/** « 2026-09 » → « sept. » / « سبتمبر », dans la langue de l'utilisateur. */
function monthLabel(month: string, locale: Locale): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", {
    month: "short",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

export function RevenueChart({ monthly }: { monthly: MonthlyPoint[] }) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();

  const config = {
    revenue: { label: t("dashboard.revenue"), color: "var(--chart-1)" },
    expenses: { label: t("dashboard.expenses"), color: "var(--chart-4)" },
  } satisfies ChartConfig;

  const data = useMemo(
    () => monthly.map((p) => ({ ...p, label: monthLabel(p.month, locale) })),
    [monthly, locale],
  );

  if (!data.length) {
    return <p className="text-muted-foreground py-12 text-center text-sm">{t("common.empty")}</p>;
  }

  return (
    <div dir="ltr">
      <ChartContainer config={config} className="h-[240px] w-full">
        <BarChart data={data} accessibilityLayer>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            fontSize={12}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={52}
            fontSize={12}
            // Des milliers bruts satureraient l'axe : « 12k » suffit à situer
            // l'ordre de grandeur, le montant exact vient de l'infobulle.
            tickFormatter={(v: number) =>
              v >= 1000 ? `${formatNumber(v / 1000, locale)}k` : formatNumber(v, locale)
            }
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value, name) => (
                  <span className="flex w-full justify-between gap-3">
                    <span className="text-muted-foreground">
                      {config[name as keyof typeof config]?.label ?? name}
                    </span>
                    <span className="tabular font-medium">
                      {formatMoney(Number(value), locale)}
                    </span>
                  </span>
                )}
              />
            }
          />
          <ChartLegend content={<ChartLegendContent />} />
          {/* Des barres et non une aire : douze seaux mensuels DISCRETS, pas
              un flux continu qu'on pourrait interpoler. */}
          <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="expenses" fill="var(--color-expenses)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartContainer>
    </div>
  );
}

const STOCK_SLICES = [
  { key: "louee", labelKey: "dashboard.rented", color: "var(--chart-1)" },
  { key: "disponible", labelKey: "stock.available", color: "var(--chart-3)" },
  { key: "nettoyage", labelKey: "stock.cleaning", color: "var(--chart-5)" },
  { key: "reparation", labelKey: "stock.repair", color: "var(--chart-4)" },
  { key: "retire", labelKey: "stock.retired", color: "var(--chart-2)" },
] as const;

export function StockChart({ stock }: { stock: StockState }) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();

  const slices = STOCK_SLICES.map((s) => ({
    key: s.key,
    label: t(s.labelKey),
    color: s.color,
    value: stock[s.key],
  })).filter((s) => s.value > 0);

  const total = slices.reduce((sum, s) => sum + s.value, 0);

  const config = Object.fromEntries(
    slices.map((s) => [s.key, { label: s.label, color: s.color }]),
  ) satisfies ChartConfig;

  if (!total) {
    return <p className="text-muted-foreground py-12 text-center text-sm">{t("common.empty")}</p>;
  }

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div dir="ltr" className="shrink-0">
        <ChartContainer config={config} className="aspect-square h-[168px]">
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
            <Pie data={slices} dataKey="value" nameKey="key" innerRadius={48} strokeWidth={2}>
              {slices.map((s) => (
                <Cell key={s.key} fill={s.color} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
      </div>

      {/* Un camembert seul ne se lit pas sur un téléphone. La légende porte le
          CHIFFRE : « 3 au nettoyage » est l'information utile, pas l'angle. */}
      <ul className="w-full space-y-1.5 text-sm">
        {slices.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-[2px]"
              style={{ backgroundColor: s.color }}
              aria-hidden
            />
            <span className="text-muted-foreground flex-1">{s.label}</span>
            <span className="tabular font-medium">{formatNumber(s.value, locale)}</span>
          </li>
        ))}
        <li className="border-border flex items-center gap-2 border-t pt-1.5">
          <span className="text-muted-foreground flex-1">{t("stock.pieces")}</span>
          <span className="tabular font-medium">{formatNumber(total, locale)}</span>
        </li>
      </ul>
    </div>
  );
}
