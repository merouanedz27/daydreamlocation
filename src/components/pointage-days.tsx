"use client";

import { useOptimistic, useTransition } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Lock, X } from "lucide-react";
import { sheet } from "@/components/sheet-table";
import { setAbsence, setMyAbsence } from "@/lib/actions/pointage";
import { formatDayMonth, formatWeekdayShort } from "@/lib/format";
import { isLocked, noon, periodDays, selfCanToggle } from "@/lib/pointage";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/routing";

/** L'ancre d'une ligne du tableau, visée par les dates d'absence du compteur. */
function rowId(day: string) {
  return `pointage-day-${day}`;
}

/**
 * Le compteur de la période : « 28 jours travaillés », puis « 2 absences ·
 * depuis le 01/10 », puis les absences elles-mêmes — « 03/10 · 12/10 ».
 * L'employé lit le MÊME chiffre que le propriétaire au moment de la paie, et
 * voit d'un coup d'œil QUELS jours on lui compte absent.
 *
 * Toucher une date amène sa ligne au centre de l'écran, le temps d'un éclat :
 * pas besoin de faire défiler le mois pour la retrouver.
 */
export function PointageCounter({
  worked,
  absences,
  start,
}: {
  worked: number;
  /** Jours d'absence de la période, dans l'ordre. */
  absences: string[];
  start: string;
}) {
  const t = useTranslations("pointage");
  const { locale } = useParams<{ locale: Locale }>();

  function reveal(day: string) {
    const row = document.getElementById(rowId(day));
    if (!row) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    row.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    row.classList.add("ring-2", "ring-destructive", "ring-inset");
    window.setTimeout(() => row.classList.remove("ring-2", "ring-destructive", "ring-inset"), 1500);
  }

  return (
    <div className="border-border bg-card rounded-lg border p-4 text-center">
      <p className="font-heading tabular text-4xl font-medium">{t("worked", { count: worked })}</p>
      <p className="text-muted-foreground mt-1 text-sm">
        {t("absences", { count: absences.length })} ·{" "}
        {t("since", { date: formatDayMonth(noon(start), locale) })}
      </p>
      {absences.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
          <span className="text-muted-foreground text-xs">{t("absentOn")}</span>
          {absences.map((day) => (
            <button
              key={day}
              type="button"
              onClick={() => reveal(day)}
              aria-label={t("showDay", { date: formatDayMonth(noon(day), locale) })}
              className="bg-destructive/10 text-destructive tabular inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-sm font-medium"
            >
              <X className="size-3.5" aria-hidden />
              {formatDayMonth(noon(day), locale)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Le tableau du client : le JOUR, puis UNE case — « Absent ». L'équipe vient
 * presque tous les jours : on ne coche que le jour où l'on ne vient pas.
 * Aujourd'hui en tête, sur fond doré.
 *
 *   - `self`  : l'employé — il coche une absence d'aujourd'hui ou d'un jour
 *               oublié de sa période, et la décoche tant qu'elle n'est pas
 *               payée ;
 *   - `owner` : le propriétaire — toute case non payée (oubli, erreur).
 *
 * Le toucher est optimiste : la case change tout de suite, l'erreur la remet
 * en place et s'affiche en toast. Une case en lecture seule porte une croix ✕
 * et son nom accessible « Absent » : jamais la couleur seule.
 */
export function PointageDays({
  mode,
  userId,
  start,
  today,
  absences,
  lockedThrough,
}: {
  mode: "self" | "owner";
  userId: string;
  /** Premier jour de la période (peut être après aujourd'hui). */
  start: string;
  today: string;
  /** Jours d'absence de la période. */
  absences: string[];
  /** Dernier jour payé : ces cases sont fermées. */
  lockedThrough: string | null;
}) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const [, startTransition] = useTransition();
  const [optimistic, toggle] = useOptimistic(
    new Set(absences),
    (current: Set<string>, change: { day: string; on: boolean }) => {
      const next = new Set(current);
      if (change.on) next.add(change.day);
      else next.delete(change.day);
      return next;
    },
  );

  function onToggle(day: string, on: boolean) {
    startTransition(async () => {
      toggle({ day, on });
      const result =
        mode === "self"
          ? await setMyAbsence(locale, day, on)
          : await setAbsence(locale, userId, day, on);
      if (!result.ok) toast.error(t(result.error));
    });
  }

  // Payé ce soir : la ligne du jour reste visible, fermée, jusqu'à demain.
  const days = periodDays(start > today ? today : start, today);

  return (
    <div className={sheet.wrapper}>
      <table className={sheet.table}>
        <thead>
          <tr className={sheet.headRow}>
            <th scope="col" className={cn(sheet.th, "text-start")}>
              <span className={sheet.thInner}>{t("pointage.day")}</span>
            </th>
            <th scope="col" className={cn(sheet.th, "w-24 text-center")}>
              <span className={cn(sheet.thInner, "justify-center")}>{t("pointage.absent")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => {
            const isToday = day === today;
            const locked = isLocked(day, lockedThrough);
            const on = optimistic.has(day);
            const editable =
              mode === "owner" ? !locked : selfCanToggle(day, on, today, start, lockedThrough);
            const label = `${formatWeekdayShort(noon(day), locale)} ${formatDayMonth(noon(day), locale)}`;
            const name = `${t("pointage.absent")} — ${label}`;
            return (
              <tr
                key={day}
                id={rowId(day)}
                className={cn(
                  "border-border scroll-mt-20 border-t transition-shadow",
                  on ? "bg-destructive/10" : isToday ? "bg-gold-soft" : "even:bg-muted/40",
                )}
              >
                <th scope="row" className={cn(sheet.td, "text-start font-normal")}>
                  <span className="tabular">{label}</span>
                  {isToday && (
                    <span className="bg-primary text-primary-foreground ms-2 inline-block rounded-full px-1.5 text-[11px] leading-5 font-medium">
                      {t("pointage.today")}
                    </span>
                  )}
                </th>
                <td className={cn(sheet.td, "py-0 text-center md:py-0")}>
                  {editable ? (
                    <label className="mx-auto flex size-11 cursor-pointer items-center justify-center">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) => onToggle(day, e.target.checked)}
                        aria-label={name}
                        className="accent-destructive size-6 cursor-pointer"
                      />
                    </label>
                  ) : (
                    <span className="text-muted-foreground mx-auto flex size-11 items-center justify-center">
                      {on ? (
                        <X className="text-destructive size-5" aria-label={name} />
                      ) : locked ? (
                        <Lock className="size-3.5" aria-label={t("pointage.paidDay")} />
                      ) : (
                        <span aria-label={`${label} : ${t("pointage.present")}`}>—</span>
                      )}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
