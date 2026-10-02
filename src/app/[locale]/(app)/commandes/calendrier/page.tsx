import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BookingCalendar, calendarRange, type CalendarView } from "@/components/booking-calendar";
import { getOrdersByEventDate } from "@/lib/queries/orders-list";
import { todayIso } from "@/lib/rental-range";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "nav" });
  return { title: t("calendar") };
}

const VIEWS: CalendarView[] = ["mois", "semaine", "jour"];
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ vue?: string; d?: string; q?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;

  // Paramètres d'URL normalisés : une valeur inconnue retombe sur le mois en
  // cours plutôt que de casser l'écran.
  const raw = await searchParams;
  const today = todayIso();
  const view = VIEWS.includes(raw.vue as CalendarView) ? (raw.vue as CalendarView) : "mois";
  const day = raw.d && ISO.test(raw.d) && !Number.isNaN(Date.parse(raw.d)) ? raw.d : today;

  const { from, to } = calendarRange(view, day, l);
  const q = (raw.q ?? "").trim();
  const orders = await getOrdersByEventDate(from, to, q);

  return (
    <BookingCalendar view={view} day={day} today={today} orders={orders} locale={l} q={q} />
  );
}
