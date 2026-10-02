import { getTranslations } from "next-intl/server";
import { CalendarX2, ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { OrderRowList } from "@/components/order-row";
import {
  formatDayMonth,
  formatLongDay,
  formatMonthYear,
  formatNumber,
  formatWeekdayShort,
} from "@/lib/format";
import { DONE_NAME_CLASS, isOrderDone, type OrderRow } from "@/lib/orders-query";
import { addDays, daysBetween, type IsoDate } from "@/lib/rental-range";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/routing";

export type CalendarView = "mois" | "semaine" | "jour";

/**
 * Premier jour de la semaine : lundi en français, SAMEDI en arabe — l'usage
 * algérien, où le week-end tombe le vendredi. Sur un calendrier en arabe qui
 * commencerait un lundi, le vendredi des mariages se retrouverait en avant-
 * dernière colonne au lieu de la dernière.
 */
const WEEK_STARTS: Record<Locale, number> = { fr: 1, ar: 6 };

/** Jour de la semaine d'une date ISO (0 = dimanche), sans piège de fuseau. */
function weekday(date: IsoDate): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function startOfWeek(date: IsoDate, locale: Locale): IsoDate {
  return addDays(date, -((weekday(date) - WEEK_STARTS[locale] + 7) % 7));
}

/** Les bornes affichées d'une vue — ce que la page doit charger. */
export function calendarRange(
  view: CalendarView,
  day: IsoDate,
  locale: Locale,
): { from: IsoDate; to: IsoDate } {
  if (view === "jour") return { from: day, to: day };
  if (view === "semaine") {
    const from = startOfWeek(day, locale);
    return { from, to: addDays(from, 6) };
  }
  const first = `${day.slice(0, 8)}01`;
  const from = startOfWeek(first, locale);
  const nextMonth = addDays(first, 32).slice(0, 8) + "01";
  const lastOfMonth = addDays(nextMonth, -1);
  // Toujours des semaines ENTIÈRES : la grille garde ses 7 colonnes.
  const weeks = Math.ceil((daysBetween(from, lastOfMonth) + 1) / 7);
  return { from, to: addDays(from, weeks * 7 - 1) };
}

/** Décalage d'une vue vers la période précédente (-1) ou suivante (+1). */
function shift(view: CalendarView, day: IsoDate, step: -1 | 1): IsoDate {
  if (view === "jour") return addDays(day, step);
  if (view === "semaine") return addDays(day, 7 * step);
  const [y, m] = day.split("-").map(Number);
  const month = new Date(Date.UTC(y, m - 1 + step, 1));
  return month.toISOString().slice(0, 10);
}

/** Lien vers une vue ; la recherche de l'en-tête (`q`) suit la navigation. */
function href(view: CalendarView, day: IsoDate, q = "") {
  return `/commandes/calendrier?vue=${view}&d=${day}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
}

/**
 * Couleur d'une commande dans la grille. Le mot reste dans la légende et la
 * fiche : la couleur n'est jamais la seule information (le nom barré dit
 * « terminée » : aller ET retour validés ; la vue Jour dit tout).
 */
function chipTone(order: OrderRow, today: IsoDate) {
  if (isOrderDone(order)) return cn("bg-muted", DONE_NAME_CLASS);
  if (order.picked_up && daysBetween(today, order.return_due_date) < 0)
    return "bg-warning-soft text-warning-foreground";
  if (order.picked_up) return "bg-primary text-primary-foreground";
  return "bg-gold-soft text-foreground";
}

/**
 * Le « Bookings calendar » de son AppSheet : Jour / Semaine / Mois, le nom du
 * client posé sur la date de l'ÉVÉNEMENT.
 *
 * Composant SERVEUR : la navigation passe par l'URL (`?vue=&d=`), comme les
 * filtres de la liste. Un lien vers « la semaine du 12 » s'envoie à un
 * collègue, et le bouton retour du téléphone revient au mois précédent.
 *
 * Dans la grille mensuelle, toucher un jour ouvre la vue Jour : à 51 px de
 * large, viser un nom précis dans la case serait une loterie au pouce.
 */
export async function BookingCalendar({
  view,
  day,
  today,
  orders,
  locale,
  q = "",
}: {
  view: CalendarView;
  day: IsoDate;
  today: IsoDate;
  orders: OrderRow[];
  locale: Locale;
  /** Recherche de l'en-tête : la grille ne montre que les commandes trouvées. */
  q?: string;
}) {
  const t = await getTranslations();
  const { from, to } = calendarRange(view, day, locale);

  const byDay = new Map<IsoDate, OrderRow[]>();
  for (const order of orders) {
    const list = byDay.get(order.event_date) ?? [];
    list.push(order);
    byDay.set(order.event_date, list);
  }

  const title =
    view === "mois"
      ? formatMonthYear(day, locale)
      : view === "semaine"
        ? `${formatDayMonth(from, locale)} – ${formatDayMonth(to, locale)}`
        : formatLongDay(day, locale);

  const views: { key: CalendarView; label: string }[] = [
    { key: "jour", label: t("calendar.day") },
    { key: "semaine", label: t("calendar.week") },
    { key: "mois", label: t("calendar.month") },
  ];

  return (
    <div>
      <div className="flex items-center gap-1">
        <nav className="flex gap-1" aria-label={t("calendar.views")}>
          {views.map((v) => (
            <Link
              key={v.key}
              href={href(v.key, day, q)}
              aria-current={view === v.key ? "page" : undefined}
              className={cn(
                "relative flex min-h-11 items-center px-3 text-base",
                view === v.key
                  ? "text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v.label}
              {view === v.key && (
                <span className="bg-primary absolute inset-x-2 bottom-1 h-0.5 rounded-full" aria-hidden />
              )}
            </Link>
          ))}
        </nav>
        <Link
          href={href(view, today, q)}
          className="text-gold-strong ms-auto flex min-h-11 items-center px-2 text-sm font-semibold uppercase"
        >
          {t("calendar.today")}
        </Link>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <Link
          href={href(view, shift(view, day, -1), q)}
          aria-label={t("calendar.previous")}
          className="hover:bg-muted flex size-11 shrink-0 items-center justify-center rounded-full"
        >
          <ChevronLeft className="size-5 rtl:-scale-x-100" aria-hidden />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-center text-lg first-letter:uppercase">
          {title}
        </h1>
        <Link
          href={href(view, shift(view, day, 1), q)}
          aria-label={t("calendar.next")}
          className="hover:bg-muted flex size-11 shrink-0 items-center justify-center rounded-full"
        >
          <ChevronRight className="size-5 rtl:-scale-x-100" aria-hidden />
        </Link>
      </div>

      {view === "mois" ? (
        <MonthGrid
          from={from}
          to={to}
          month={day.slice(0, 7)}
          today={today}
          byDay={byDay}
          locale={locale}
          q={q}
          moreLabel={(n) => t("calendar.more", { n: formatNumber(n, locale) })}
        />
      ) : (
        <DayGroups
          from={from}
          to={to}
          today={today}
          byDay={byDay}
          locale={locale}
          emptyLabel={q ? t("search.noMatch", { q }) : t("calendar.dayEmpty")}
          showHeadings={view === "semaine"}
        />
      )}

      {view === "mois" && (
        <ul className="text-muted-foreground mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <Legend tone="bg-gold-soft" label={t("orders.status.reserved")} />
          <Legend tone="bg-primary" label={t("orders.pickedUp")} />
          <Legend tone="bg-warning-soft border border-warning-foreground/40" label={t("calendar.late")} />
          <Legend tone="bg-muted border border-border" label={t("calendar.done")} done />
        </ul>
      )}
    </div>
  );
}

function Legend({ tone, label, done }: { tone: string; label: string; done?: boolean }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className={cn("size-3 rounded-sm", tone)} aria-hidden />
      {/* Le libellé « Terminée » porte lui-même le trait, comme les noms. */}
      <span className={done ? DONE_NAME_CLASS : undefined}>{label}</span>
    </li>
  );
}

/** Nombre de noms affichés par case avant « +N ». */
const CHIPS_PER_DAY = 3;

function MonthGrid({
  from,
  to,
  month,
  today,
  byDay,
  locale,
  q,
  moreLabel,
}: {
  from: IsoDate;
  to: IsoDate;
  month: string;
  today: IsoDate;
  byDay: Map<IsoDate, OrderRow[]>;
  locale: Locale;
  q: string;
  moreLabel: (n: number) => string;
}) {
  const days: IsoDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);

  return (
    <div className="border-border bg-card mt-2 overflow-hidden rounded-lg border">
      <div className="border-border grid grid-cols-7 border-b">
        {days.slice(0, 7).map((d) => (
          <div key={d} className="text-muted-foreground py-2 text-center text-xs">
            {formatWeekdayShort(d, locale)}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const list = byDay.get(d) ?? [];
          const inMonth = d.startsWith(month);
          const isToday = d === today;
          const hidden = list.length - CHIPS_PER_DAY;
          return (
            <Link
              key={d}
              href={href("jour", d, q)}
              aria-label={`${formatLongDay(d, locale)} — ${list.length}`}
              className={cn(
                "border-border hover:bg-muted/60 flex min-h-24 min-w-0 flex-col gap-0.5 border-t px-0.5 pt-1 pb-1.5",
                i % 7 !== 0 && "border-s",
                i < 7 && "border-t-0",
                !inMonth && "bg-muted/40",
              )}
            >
              <span
                className={cn(
                  "tabular mx-auto mb-0.5 flex size-6 items-center justify-center rounded-full text-xs",
                  isToday && "bg-primary text-primary-foreground font-semibold",
                  !isToday && !inMonth && "text-muted-foreground",
                )}
              >
                {formatNumber(Number(d.slice(8)), locale)}
              </span>
              {list.slice(0, CHIPS_PER_DAY).map((order) => (
                <span
                  key={order.id}
                  className={cn(
                    "block truncate rounded-sm px-1 text-[11px] leading-4",
                    chipTone(order, today),
                  )}
                >
                  {order.customer_name}
                </span>
              ))}
              {hidden > 0 && (
                <span className="bg-foreground text-background block rounded-sm text-center text-[10px] leading-4 font-semibold">
                  {moreLabel(hidden)}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function DayGroups({
  from,
  to,
  today,
  byDay,
  locale,
  emptyLabel,
  showHeadings,
}: {
  from: IsoDate;
  to: IsoDate;
  today: IsoDate;
  byDay: Map<IsoDate, OrderRow[]>;
  locale: Locale;
  emptyLabel: string;
  showHeadings: boolean;
}) {
  const days: IsoDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  const any = days.some((d) => byDay.get(d)?.length);

  if (!any) {
    return (
      <div className="border-border mt-3 flex flex-col items-center rounded-lg border border-dashed px-6 py-14 text-center">
        <CalendarX2 className="text-muted-foreground size-8" aria-hidden />
        <p className="text-muted-foreground mt-3 text-sm">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-4">
      {days.map((d) => {
        const list = byDay.get(d);
        if (!list?.length) return null;
        return (
          <section key={d}>
            {showHeadings && (
              <h2
                className={cn(
                  "mb-2 text-sm font-medium first-letter:uppercase",
                  d === today && "text-gold-strong",
                )}
              >
                {formatLongDay(d, locale)}
                <span className="text-muted-foreground font-normal">
                  {" · "}
                  {formatNumber(list.length, locale)}
                </span>
              </h2>
            )}
            <OrderRowList orders={list} />
          </section>
        );
      })}
    </div>
  );
}
