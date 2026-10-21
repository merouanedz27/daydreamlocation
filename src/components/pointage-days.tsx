"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Lock, X } from "lucide-react";
import { sheet } from "@/components/sheet-table";
import { sendOrQueue } from "@/lib/offline/outbox";
import { useOutbox } from "@/components/offline-sync";
import { formatDayMonth, formatWeekdayShort } from "@/lib/format";
import { isLocked, noon, periodDays, selfCanToggle, type MarkKind } from "@/lib/pointage";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/routing";

/** L'ancre d'une ligne du tableau, visée par les dates du compteur. */
function rowId(day: string) {
  return `pointage-day-${day}`;
}

/**
 * Le compteur de la période : « 28 jours travaillés », puis « 2 absences ·
 * depuis le 01/10 » (permanent) ou « 3 présences · depuis le 01/10 »
 * (remplaçant), puis les jours cochés eux-mêmes — « 03/10 · 12/10 ».
 * L'employé lit le MÊME chiffre que le propriétaire au moment de la paie, et
 * voit d'un coup d'œil QUELS jours on lui compte.
 *
 * Toucher une date amène sa ligne au centre de l'écran, le temps d'un éclat :
 * pas besoin de faire défiler le mois pour la retrouver.
 */
export function PointageCounter({
  kind,
  worked,
  marks,
  start,
}: {
  kind: MarkKind;
  worked: number;
  /** Jours cochés de la période, dans l'ordre. */
  marks: string[];
  start: string;
}) {
  const t = useTranslations("pointage");
  const { locale } = useParams<{ locale: Locale }>();
  const presence = kind === "presence";
  const ring = presence ? "ring-success" : "ring-destructive";

  function reveal(day: string) {
    const row = document.getElementById(rowId(day));
    if (!row) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    row.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    row.classList.add("ring-2", ring, "ring-inset");
    window.setTimeout(() => row.classList.remove("ring-2", ring, "ring-inset"), 1500);
  }

  return (
    <div className="border-border bg-card rounded-lg border p-4 text-center">
      <p className="font-heading tabular text-4xl font-medium">{t("worked", { count: worked })}</p>
      <p className="text-muted-foreground mt-1 text-sm">
        {presence ? t("presences", { count: marks.length }) : t("absences", { count: marks.length })} ·{" "}
        {t("since", { date: formatDayMonth(noon(start), locale) })}
      </p>
      {marks.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
          <span className="text-muted-foreground text-xs">{presence ? t("presentOn") : t("absentOn")}</span>
          {marks.map((day) => (
            <button
              key={day}
              type="button"
              onClick={() => reveal(day)}
              aria-label={t("showDay", { date: formatDayMonth(noon(day), locale) })}
              className={cn(
                "tabular inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-sm font-medium",
                presence ? "bg-success-soft text-success-foreground" : "bg-destructive/10 text-destructive",
              )}
            >
              {presence ? <Check className="size-3.5" aria-hidden /> : <X className="size-3.5" aria-hidden />}
              {formatDayMonth(noon(day), locale)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Le tableau du client : le JOUR, puis UNE case.
 *
 *   - `absence`  (permanent)  — « Absent » : il vient presque tous les jours,
 *                               on ne coche que le jour où il ne vient pas ;
 *   - `presence` (remplaçant) — « Présent » : il ne vient que pour remplacer,
 *                               on ne coche que les jours où il vient.
 *
 * Et qui coche :
 *   - `self`  : l'employé — aujourd'hui ou un jour oublié de sa période, qu'il
 *               décoche tant que ce n'est pas payé ;
 *   - `owner` : le propriétaire — toute case non payée (oubli, erreur).
 *
 * Aujourd'hui en tête, sur fond doré. Le toucher est optimiste : la case
 * change tout de suite, l'erreur la remet en place et s'affiche en toast.
 * Sans réseau, le geste attend dans la file hors ligne et la case reste
 * cochée ; il part de lui-même au retour du réseau. Une
 * case en lecture seule porte une icône et son nom accessible : jamais la
 * couleur seule.
 */
export function PointageDays({
  kind,
  mode,
  userId,
  start,
  today,
  marks,
  lockedThrough,
}: {
  kind: MarkKind;
  mode: "self" | "owner";
  userId: string;
  /** Premier jour de la période (peut être après aujourd'hui). */
  start: string;
  today: string;
  /** Jours cochés de la période. */
  marks: string[];
  /** Dernier jour payé : ces cases sont fermées. */
  lockedThrough: string | null;
}) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const [, startTransition] = useTransition();
  const [optimistic, toggle] = useOptimistic(
    new Set(marks),
    (current: Set<string>, change: { day: string; on: boolean }) => {
      const next = new Set(current);
      if (change.on) next.add(change.day);
      else next.delete(change.day);
      return next;
    },
  );
  // Gestes gardés dans la file hors ligne, par jour : la base ne les connaît
  // pas encore. Un jour que la base a rattrapé sort de la liste.
  const [queued, setQueued] = useState<Map<string, boolean>>(() => new Map());
  const saved = new Set(marks);
  const caughtUp = [...queued].filter(([day, on]) => saved.has(day) === on);
  if (caughtUp.length) {
    const next = new Map(queued);
    for (const [day] of caughtUp) next.delete(day);
    setQueued(next);
  }
  // Écran resservi sans réseau : les cases en file se voient quand même.
  const inQueue = new Map<string, boolean>();
  for (const item of useOutbox()) {
    const op = item.op;
    if (
      item.status === "pending" &&
      op.kind === "mark" &&
      op.markKind === kind &&
      op.userId === (mode === "owner" ? userId : null)
    ) {
      inQueue.set(op.day, op.on);
    }
  }
  const presence = kind === "presence";
  const column = presence ? t("pointage.presentColumn") : t("pointage.absent");

  function onToggle(day: string, on: boolean, title: string) {
    startTransition(async () => {
      toggle({ day, on });
      const result = await sendOrQueue(
        { kind: "mark", markKind: kind, day, on, userId: mode === "owner" ? userId : null },
        title,
      );
      if (!result.ok) toast.error(t(result.error));
      else if (result.queued) {
        setQueued((current) => new Map(current).set(day, on));
        toast(t("offline.queuedToast"));
      }
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
              <span className={cn(sheet.thInner, "justify-center")}>{column}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => {
            const isToday = day === today;
            const locked = isLocked(day, lockedThrough);
            const on = queued.has(day)
              ? queued.get(day)!
              : inQueue.has(day)
                ? inQueue.get(day)!
                : optimistic.has(day);
            const editable =
              mode === "owner" ? !locked : selfCanToggle(day, on, today, start, lockedThrough);
            const label = `${formatWeekdayShort(noon(day), locale)} ${formatDayMonth(noon(day), locale)}`;
            const name = `${column} — ${label}`;
            return (
              <tr
                key={day}
                id={rowId(day)}
                className={cn(
                  "border-border scroll-mt-20 border-t transition-shadow",
                  on
                    ? presence
                      ? "bg-success-soft"
                      : "bg-destructive/10"
                    : isToday
                      ? "bg-gold-soft"
                      : "even:bg-muted/40",
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
                        onChange={(e) => onToggle(day, e.target.checked, name)}
                        aria-label={name}
                        className={cn(
                          "size-6 cursor-pointer",
                          presence ? "accent-success" : "accent-destructive",
                        )}
                      />
                    </label>
                  ) : (
                    <span className="text-muted-foreground mx-auto flex size-11 items-center justify-center">
                      {on ? (
                        presence ? (
                          <Check className="text-success-foreground size-5" aria-label={name} />
                        ) : (
                          <X className="text-destructive size-5" aria-label={name} />
                        )
                      ) : locked ? (
                        <Lock className="size-3.5" aria-label={t("pointage.paidDay")} />
                      ) : (
                        <span aria-label={label}>—</span>
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
