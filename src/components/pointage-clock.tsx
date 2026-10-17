"use client";

import { useEffect, useState, useTransition } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowRight, Check, LogIn, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { clockIn, clockOut } from "@/lib/actions/pointage";
import {
  formatDayMonth,
  formatDuration,
  formatLongDay,
  formatTime,
  formatWeekdayShort,
} from "@/lib/format";
import { shiftMinutes, type Shift } from "@/lib/pointage";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/routing";

/** L'heure qui avance, à la minute : le compteur n'affiche pas de secondes. */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * La pointeuse de l'employé : UN bouton, au pouce. Une arrivée et un départ
 * par jour, rien d'autre.
 *
 * Trois états qu'on ne peut pas confondre, même d'un coup d'œil en plein
 * soleil :
 *   - pas encore pointé : bouton JAUNE « Pointer l'arrivée » ;
 *   - en service : bouton BRUN « Pointer le départ », compteur qui avance ;
 *   - journée terminée : plus de bouton, la durée du jour.
 * La couleur ne porte jamais seule l'état : la pastille le dit en toutes
 * lettres.
 *
 * L'arrivée part au premier toucher ; le départ se confirme — un départ par
 * erreur clôt la journée, et seul le propriétaire pourrait la rouvrir.
 */
export function PointageClock({
  today,
  shifts,
  weekClosedMinutes,
  weekDays,
}: {
  /** Jour de la boutique, `YYYY-MM-DD`. */
  today: string;
  /** La journée d'aujourd'hui, plus une éventuelle journée restée ouverte la veille. */
  shifts: Shift[];
  weekClosedMinutes: number;
  /** Jours pointés de la semaine, journée en cours comprise. */
  weekDays: number;
}) {
  const t = useTranslations("pointage");
  const tRoot = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const now = useNow();
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const open = shifts.find((s) => !s.clock_out) ?? null;
  const day = shifts.find((s) => s.work_date === today) ?? null;
  const state = open ? "in" : day ? "done" : "none";
  const current = open ?? day;
  const elapsed = open ? shiftMinutes(open, now) : 0;
  const weekMinutes = weekClosedMinutes + elapsed;

  function onClockIn() {
    startTransition(async () => {
      const result = await clockIn(locale);
      if (!result.ok) {
        toast.error(tRoot(result.error));
        return;
      }
      toast.success(t("clockedIn", { time: formatTime(result.at, locale) }));
    });
  }

  async function onClockOut() {
    const result = await clockOut(locale);
    if (!result.ok) return { ok: false, error: result.error };
    toast.success(
      t("clockedOut", {
        time: formatTime(result.at, locale),
        duration: formatDuration(elapsed, locale),
      }),
    );
    return { ok: true };
  }

  return (
    <div className="space-y-4">
      <section className="border-border bg-card rounded-lg border p-4">
        <div className="flex items-center justify-between gap-3">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 text-xs leading-6 font-medium",
              state === "in" && "bg-success-soft text-success-foreground",
              state === "done" && "bg-gold-soft text-foreground",
              state === "none" && "bg-muted text-muted-foreground",
            )}
          >
            {state === "done" ? (
              <Check className="size-3.5" aria-hidden />
            ) : (
              <span
                aria-hidden
                className={cn(
                  "size-1.5 rounded-full",
                  state === "in" ? "bg-success" : "bg-muted-foreground",
                )}
              />
            )}
            {open
              ? t("onDutySince", { time: formatTime(open.clock_in, locale) })
              : state === "done"
                ? t("dayDone")
                : t("offDuty")}
          </span>
          <span className="text-muted-foreground text-xs">
            {formatLongDay(`${today}T12:00:00+01:00`, locale)}
          </span>
        </div>

        {current && (
          <div className="mt-5 text-center">
            <p className="text-muted-foreground text-xs">
              {open ? t("elapsed") : t("dayTotal")}
            </p>
            <p
              className="font-heading tabular mt-1 text-4xl font-medium"
              aria-live="polite"
              suppressHydrationWarning
            >
              {formatDuration(shiftMinutes(current, now), locale)}
            </p>
            {open && open.work_date !== today && (
              <p className="text-warning-foreground mt-1 text-xs">
                {t("startedOn", { date: formatDayMonth(open.clock_in, locale) })}
              </p>
            )}
          </div>
        )}

        {state !== "done" && (
          <Button
            type="button"
            variant={open ? "secondary" : "default"}
            disabled={isPending}
            onClick={open ? () => setConfirmOpen(true) : onClockIn}
            className="mt-5 h-16 w-full text-lg"
          >
            {isPending ? (
              <Spinner />
            ) : open ? (
              <LogOut className="size-5 rtl:-scale-x-100" aria-hidden />
            ) : (
              <LogIn className="size-5 rtl:-scale-x-100" aria-hidden />
            )}
            {open ? t("clockOut") : t("clockIn")}
          </Button>
        )}

        {/* La journée en deux lignes, comme sur un registre. */}
        <dl className="border-border divide-border mt-5 divide-y border-t text-sm">
          <div className="flex min-h-11 items-center justify-between gap-3">
            <dt className="text-muted-foreground">{t("arrival")}</dt>
            <dd className="tabular font-medium">
              {current ? formatTime(current.clock_in, locale) : "—"}
            </dd>
          </div>
          <div className="flex min-h-11 items-center justify-between gap-3">
            <dt className="text-muted-foreground">{t("departure")}</dt>
            <dd className="tabular font-medium">
              {open ? (
                <span className="text-success-foreground inline-flex items-center gap-1">
                  <span aria-hidden className="bg-success size-1.5 rounded-full" />
                  {t("ongoing")}
                </span>
              ) : day?.clock_out ? (
                formatTime(day.clock_out, locale)
              ) : (
                "—"
              )}
            </dd>
          </div>
        </dl>

        {current?.corrected_at && (
          <p className="text-muted-foreground mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="bg-gold-soft text-foreground rounded-full px-1.5 text-[11px] leading-5">
              {t("corrected")}
            </span>
            {current.note}
          </p>
        )}
      </section>

      <div className="text-muted-foreground flex items-baseline justify-between gap-3 px-1 text-sm">
        <span>{t("week")}</span>
        <span className="tabular" suppressHydrationWarning>
          <span className="text-foreground font-medium">{formatDuration(weekMinutes, locale)}</span>
          {" · "}
          {t("days", { count: weekDays })}
        </span>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        tone="default"
        icon={<LogOut className="size-4 rtl:-scale-x-100" />}
        title={t("confirmOutTitle")}
        description={
          open
            ? t("confirmOutBody", {
                duration: formatDuration(elapsed, locale),
                time: formatTime(open.clock_in, locale),
              })
            : undefined
        }
        confirmLabel={t("clockOut")}
        onConfirm={onClockOut}
      />
    </div>
  );
}

/** Une journée : « ven. 17/10 · 08:58 → 17:02 · 8 h 04 ». Ligne du détail du mois. */
export function ShiftLine({
  shift,
  now,
  locale,
  actions,
}: {
  shift: Shift;
  now: Date;
  locale: Locale;
  actions?: React.ReactNode;
}) {
  const t = useTranslations("pointage");
  const date = `${shift.work_date}T12:00:00+01:00`;
  return (
    <li className="flex min-h-14 items-center gap-3 py-2 ps-3 pe-3 text-sm">
      <span className="tabular flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <span className="text-muted-foreground w-full text-xs">
          {formatWeekdayShort(date, locale)} {formatDayMonth(date, locale)}
        </span>
        <span>{formatTime(shift.clock_in, locale)}</span>
        <ArrowRight className="text-muted-foreground size-3.5 rtl:-scale-x-100" aria-hidden />
        {shift.clock_out ? (
          <span>{formatTime(shift.clock_out, locale)}</span>
        ) : (
          <span className="text-success-foreground inline-flex items-center gap-1 font-medium">
            <span aria-hidden className="bg-success size-1.5 rounded-full" />
            {t("ongoing")}
          </span>
        )}
        {shift.corrected_at && (
          <span className="bg-gold-soft text-foreground rounded-full px-1.5 text-[11px] leading-5">
            {t("corrected")}
          </span>
        )}
        {shift.note && (
          <span className="text-muted-foreground w-full truncate text-xs">{shift.note}</span>
        )}
      </span>
      <span
        className={cn("tabular shrink-0 text-end", !shift.clock_out && "text-muted-foreground")}
        suppressHydrationWarning
      >
        {formatDuration(shiftMinutes(shift, now), locale)}
      </span>
      {actions}
    </li>
  );
}
