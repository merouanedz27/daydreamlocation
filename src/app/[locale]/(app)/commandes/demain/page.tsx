import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PartyPopper } from "lucide-react";
import { OrderRowList } from "@/components/order-row";
import { RefreshOnNewDay } from "@/components/refresh-on-new-day";
import { getOrdersByEventDate } from "@/lib/queries/orders-list";
import { addDays, todayIso, type IsoDate } from "@/lib/rental-range";
import { formatLongDay, formatNumber } from "@/lib/format";
import type { OrderRow } from "@/lib/orders-query";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "nav" });
  return { title: t("tomorrow") };
}

/**
 * « Demain Location » de son AppSheet, élargi à AUJOURD'HUI : les clients dont
 * le MARIAGE est aujourd'hui ou demain. Un client marié aujourd'hui qui n'est
 * pas encore passé ne doit pas sortir de la liste — c'est lui qu'on oublie.
 * Un simple filtre, pas un second calendrier : le lendemain, la liste a
 * changé d'elle-même.
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
  const tomorrow = addDays(today, 1);
  const { q = "" } = await searchParams;

  const orders = await getOrdersByEventDate(today, tomorrow, q);
  // Aujourd'hui : les tenues pas encore sorties d'abord, ce sont les urgentes.
  const todayOrders = orders
    .filter((o) => o.event_date === today)
    .sort((a, b) => Number(a.picked_up) - Number(b.picked_up));
  const tomorrowOrders = orders.filter((o) => o.event_date === tomorrow);
  const empty = q ? t("search.noMatch", { q }) : t("calendar.dayEmpty");

  return (
    <div>
      <RefreshOnNewDay day={today} />

      <div className="text-center">
        <h1 className="truncate text-xl">{t("nav.tomorrow")}</h1>
        <p className="text-muted-foreground text-sm">
          {t("calendar.count", { count: orders.length, n: formatNumber(orders.length, l) })}
        </p>
      </div>

      {orders.length ? (
        <>
          <DaySection
            title={t("orders.today")}
            day={today}
            hint={t("calendar.todayHint")}
            orders={todayOrders}
            empty={empty}
            locale={l}
          />
          <DaySection
            title={t("orders.tomorrow")}
            day={tomorrow}
            hint={t("calendar.tomorrowHint")}
            orders={tomorrowOrders}
            empty={empty}
            locale={l}
          />
        </>
      ) : (
        <div className="border-border mt-4 flex flex-col items-center rounded-lg border border-dashed px-6 py-14 text-center">
          <PartyPopper className="text-muted-foreground size-8" aria-hidden />
          <p className="text-muted-foreground mt-3 text-sm">{empty}</p>
        </div>
      )}
    </div>
  );
}

async function DaySection({
  title,
  day,
  hint,
  orders,
  empty,
  locale,
}: {
  title: string;
  day: IsoDate;
  hint: string;
  orders: OrderRow[];
  empty: string;
  locale: Locale;
}) {
  const t = await getTranslations();
  return (
    <section className="mt-6">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-muted-foreground tabular truncate text-xs">
          {formatLongDay(day, locale)} ·{" "}
          {t("calendar.count", { count: orders.length, n: formatNumber(orders.length, locale) })}
        </p>
      </div>
      <p className="text-muted-foreground mt-1 text-xs">{hint}</p>

      <div className="mt-2">
        {orders.length ? (
          <OrderRowList orders={orders} action="picked_up" />
        ) : (
          <p className="border-border text-muted-foreground rounded-lg border border-dashed px-4 py-5 text-center text-sm">
            {empty}
          </p>
        )}
      </div>
    </section>
  );
}
