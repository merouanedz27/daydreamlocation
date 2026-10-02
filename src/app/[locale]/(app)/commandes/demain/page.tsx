import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PartyPopper } from "lucide-react";
import { OrderRowList } from "@/components/order-row";
import { RefreshOnNewDay } from "@/components/refresh-on-new-day";
import { getOrdersByEventDate } from "@/lib/queries/orders-list";
import { addDays, todayIso } from "@/lib/rental-range";
import { formatLongDay, formatNumber } from "@/lib/format";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "nav" });
  return { title: t("tomorrow") };
}

/**
 * « Demain Location » de son AppSheet : les clients dont le MARIAGE est demain,
 * et rien d'autre. Un simple filtre — pas un second calendrier : l'équipe
 * l'ouvre en arrivant pour savoir sur quoi se concentrer, et le lendemain la
 * liste a changé d'elle-même.
 *
 * Le bouton ✈ de chaque ligne valide la sortie en un toucher.
 */
export default async function TomorrowPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;
  const t = await getTranslations();

  const today = todayIso();
  const day = addDays(today, 1);
  const { q = "" } = await searchParams;

  const orders = await getOrdersByEventDate(day, day, q);

  return (
    <div>
      <RefreshOnNewDay day={today} />

      <div className="text-center">
        <h1 className="truncate text-xl">{t("orders.tomorrow")}</h1>
        <p className="text-muted-foreground text-sm">
          {formatLongDay(day, l)} ·{" "}
          {t("calendar.count", { count: orders.length, n: formatNumber(orders.length, l) })}
        </p>
      </div>

      <p className="text-muted-foreground mt-2 text-center text-xs">{t("calendar.tomorrowHint")}</p>

      <div className="mt-4">
        {orders.length ? (
          <OrderRowList orders={orders} action="picked_up" />
        ) : (
          <div className="border-border flex flex-col items-center rounded-lg border border-dashed px-6 py-14 text-center">
            <PartyPopper className="text-muted-foreground size-8" aria-hidden />
            <p className="text-muted-foreground mt-3 text-sm">
              {q ? t("search.noMatch", { q }) : t("calendar.dayEmpty")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
