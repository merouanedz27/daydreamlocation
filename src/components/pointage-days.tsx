"use client";

import { useOptimistic, useTransition } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Lock } from "lucide-react";
import { sheet } from "@/components/sheet-table";
import { setDay, setMyDay } from "@/lib/actions/pointage";
import { formatDayMonth, formatWeekdayShort } from "@/lib/format";
import {
  SHIFTS,
  isLocked,
  noon,
  periodDays,
  selfCanToggle,
  slotKey,
  type ShiftKind,
} from "@/lib/pointage";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/routing";

/**
 * Le compteur de la période : « 18 jours », depuis le 01/10 — chaque case
 * cochée compte un jour. L'employé lit le MÊME chiffre que le propriétaire au
 * moment de la paie.
 */
export function PointageCounter({ count, start }: { count: number; start: string }) {
  const t = useTranslations("pointage");
  const { locale } = useParams<{ locale: Locale }>();
  return (
    <div className="border-border bg-card rounded-lg border p-4 text-center">
      <p className="font-heading tabular text-4xl font-medium">{t("count", { count })}</p>
      <p className="text-muted-foreground mt-1 text-sm">
        {t("since", { date: formatDayMonth(noon(start), locale) })}
      </p>
    </div>
  );
}

/**
 * Le tableau du client : le JOUR, puis deux cases — MATIN et APRÈS-MIDI.
 * D'habitude l'employé n'en coche qu'une ; les deux font deux jours.
 * Aujourd'hui en tête, sur fond doré.
 *
 *   - `self`  : l'employé — il coche aujourd'hui ou un jour oublié de sa
 *               période ; il ne décoche qu'aujourd'hui (`selfCanToggle`) ;
 *   - `owner` : le propriétaire — toute case non payée (oubli, erreur).
 *
 * Le toucher est optimiste : la case change tout de suite, l'erreur la remet
 * en place et s'affiche en toast. Une case cochée en lecture seule porte une
 * coche ✓ et son nom accessible « Présent » : jamais la couleur seule.
 */
export function PointageDays({
  mode,
  userId,
  start,
  today,
  checked,
  lockedThrough,
}: {
  mode: "self" | "owner";
  userId: string;
  start: string;
  today: string;
  /** Cases cochées (`slotKey`). */
  checked: string[];
  /** Dernier jour payé : ces cases sont fermées. */
  lockedThrough: string | null;
}) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const [, startTransition] = useTransition();
  const [optimistic, toggle] = useOptimistic(
    new Set(checked),
    (current: Set<string>, change: { key: string; on: boolean }) => {
      const next = new Set(current);
      if (change.on) next.add(change.key);
      else next.delete(change.key);
      return next;
    },
  );

  function onToggle(day: string, shift: ShiftKind, on: boolean) {
    startTransition(async () => {
      toggle({ key: slotKey(day, shift), on });
      const result =
        mode === "self"
          ? await setMyDay(locale, day, shift, on)
          : await setDay(locale, userId, day, shift, on);
      if (!result.ok) toast.error(t(result.error));
    });
  }

  const days = periodDays(start, today);

  return (
    <div className={sheet.wrapper}>
      <table className={sheet.table}>
        <thead>
          <tr className={sheet.headRow}>
            <th scope="col" className={cn(sheet.th, "text-start")}>
              <span className={sheet.thInner}>{t("pointage.day")}</span>
            </th>
            {SHIFTS.map((shift) => (
              <th key={shift} scope="col" className={cn(sheet.th, "w-24 text-center")}>
                <span className={cn(sheet.thInner, "justify-center")}>
                  {t(`pointage.shifts.${shift}`)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((day) => {
            const isToday = day === today;
            const locked = isLocked(day, lockedThrough);
            const label = `${formatWeekdayShort(noon(day), locale)} ${formatDayMonth(noon(day), locale)}`;
            return (
              <tr
                key={day}
                className={cn(
                  "border-border border-t",
                  isToday ? "bg-gold-soft" : "even:bg-muted/40",
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
                {SHIFTS.map((shift) => {
                  const on = optimistic.has(slotKey(day, shift));
                  const editable =
                    mode === "owner" ? !locked : selfCanToggle(day, on, today, lockedThrough);
                  const name = `${t(`pointage.shifts.${shift}`)} — ${label}`;
                  return (
                    <td key={shift} className={cn(sheet.td, "py-0 text-center md:py-0")}>
                      {editable ? (
                        <label className="mx-auto flex size-11 cursor-pointer items-center justify-center">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={(e) => onToggle(day, shift, e.target.checked)}
                            aria-label={name}
                            className="accent-primary size-6 cursor-pointer"
                          />
                        </label>
                      ) : (
                        <span className="text-muted-foreground mx-auto flex size-11 items-center justify-center">
                          {on ? (
                            <Check
                              className="text-success size-5"
                              aria-label={`${name} : ${t("pointage.present")}`}
                            />
                          ) : locked ? (
                            <Lock className="size-3.5" aria-label={t("pointage.paidDay")} />
                          ) : (
                            <span aria-label={`${name} : ${t("pointage.absent")}`}>—</span>
                          )}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
