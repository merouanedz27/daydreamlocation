"use client";

import { useOptimistic, useTransition } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Lock } from "lucide-react";
import { sheet } from "@/components/sheet-table";
import { setDay, setToday } from "@/lib/actions/pointage";
import { formatDayMonth, formatWeekdayShort } from "@/lib/format";
import { isLocked, noon, periodDays } from "@/lib/pointage";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/routing";

/**
 * Le compteur de la période : « 18 jours », depuis le 01/10. L'employé lit le
 * MÊME chiffre que le propriétaire au moment de la paie.
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
 * Le tableau du client : deux colonnes, le JOUR et sa CASE. Aujourd'hui en
 * tête, sur fond doré : c'est la seule case que l'employé peut toucher.
 *
 *   - `self`  : l'employé — seule la case du jour est active, à la date du
 *               serveur ;
 *   - `owner` : le propriétaire — toute case non payée (oubli, erreur).
 *
 * Le toucher est optimiste : la case change tout de suite, l'erreur la remet
 * en place et s'affiche en toast. Un jour coché porte aussi une coche ✓ et
 * son nom accessible « Présent » : jamais la couleur seule.
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
  checked: string[];
  /** Dernier jour payé : ces cases sont fermées. */
  lockedThrough: string | null;
}) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const [, startTransition] = useTransition();
  const [optimistic, toggle] = useOptimistic(
    new Set(checked),
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
        mode === "self" ? await setToday(locale, on) : await setDay(locale, userId, day, on);
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
            <th scope="col" className={cn(sheet.th, "w-24 text-center")}>
              <span className={cn(sheet.thInner, "justify-center")}>{t("pointage.present")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => {
            const isToday = day === today;
            const on = optimistic.has(day);
            const locked = isLocked(day, lockedThrough);
            const editable = !locked && (mode === "owner" || isToday);
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
                    <span className="bg-primary text-primary-foreground ms-2 rounded-full px-1.5 text-[11px] leading-5 font-medium">
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
                        aria-label={`${t("pointage.present")} — ${label}`}
                        className="accent-primary size-6 cursor-pointer"
                      />
                    </label>
                  ) : (
                    <span className="text-muted-foreground mx-auto flex size-11 items-center justify-center">
                      {on ? (
                        <Check className="text-success size-5" aria-label={t("pointage.present")} />
                      ) : locked ? (
                        <Lock className="size-3.5" aria-label={t("pointage.paidDay")} />
                      ) : (
                        <span aria-label={t("pointage.absent")}>—</span>
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
