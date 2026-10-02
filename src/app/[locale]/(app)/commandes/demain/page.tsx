import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronLeft, ChevronRight, PartyPopper } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { OrderRowList } from "@/components/order-row";
import { getOrdersByEventDate } from "@/lib/queries/orders-list";
import { addDays, daysBetween, todayIso } from "@/lib/rental-range";
import { formatLongDay, formatNumber } from "@/lib/format";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "nav" });
  return { title: t("tomorrow") };
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * « Demain Location » de son AppSheet : les clients dont le MARIAGE est demain.
 * Ce sont eux qui passent aujourd'hui retirer leur tenue (retrait = J−1) —
 * l'écran que l'équipe ouvre le matin pour préparer les housses et appeler
 * ceux qui ne sont pas encore venus.
 *
 * Le bouton ✈ de chaque ligne valide la sortie en un toucher. Les flèches
 * passent au jour suivant ou précédent : le samedi, on prépare aussi dimanche.
 */
export default async function TomorrowPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ d?: string; q?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;
  const t = await getTranslations();

  const today = todayIso();
  const { d, q = "" } = await searchParams;
  // La recherche de l'en-tête suit les flèches d'un jour à l'autre.
  const dayHref = (day: string) =>
    `/commandes/demain?d=${day}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  const day = d && ISO.test(d) ? d : addDays(today, 1);
  const offset = daysBetween(today, day);

  const orders = await getOrdersByEventDate(day, day, q);

  const heading =
    offset === 1 ? t("orders.tomorrow") : offset === 0 ? t("orders.today") : formatLongDay(day, l);

  return (
    <div>
      <div className="flex items-center gap-2">
        <Link
          href={dayHref(addDays(day, -1))}
          aria-label={t("calendar.previousDay")}
          className="hover:bg-muted flex size-11 shrink-0 items-center justify-center rounded-full"
        >
          <ChevronLeft className="size-5 rtl:-scale-x-100" aria-hidden />
        </Link>
        <div className="min-w-0 flex-1 text-center">
          <h1 className="truncate text-xl">{heading}</h1>
          <p className="text-muted-foreground text-sm">
            {offset === 0 || offset === 1 ? formatLongDay(day, l) : null}
            {offset === 0 || offset === 1 ? " · " : null}
            {t("calendar.count", { count: orders.length, n: formatNumber(orders.length, l) })}
          </p>
        </div>
        <Link
          href={dayHref(addDays(day, 1))}
          aria-label={t("calendar.nextDay")}
          className="hover:bg-muted flex size-11 shrink-0 items-center justify-center rounded-full"
        >
          <ChevronRight className="size-5 rtl:-scale-x-100" aria-hidden />
        </Link>
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
