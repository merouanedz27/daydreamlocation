"use client";

import { useEffect, useState, useTransition } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowRight, LogIn, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { clockIn, clockOut } from "@/lib/actions/pointage";
import { formatDayMonth, formatDuration, formatLongDay, formatTime } from "@/lib/format";
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
 * La pointeuse de l'employé : UN bouton, au pouce.
 *
 * Deux états qu'on ne peut pas confondre, même d'un coup d'œil en plein
 * soleil : hors service, le bouton est JAUNE (« Pointer l'arrivée ») ; en
 * service, il passe au BRUN (« Pointer le départ ») et un compteur s'affiche.
 * La couleur ne porte jamais seule l'état : la pastille le dit en toutes
 * lettres.
 *
 * L'arrivée part au premier toucher ; le départ se confirme — un départ par
 * erreur couperait la journée, et seul le propriétaire pourrait la rouvrir.
 */
export function PointageClock({
  today,
  shifts,
  weekClosedMinutes,
  weekDays,
}: {
  /** Jour de la boutique, `YYYY-MM-DD`. */
  today: string;
  /** Les périodes du jour, plus une éventuelle période restée ouverte la veille. */
  shifts: Shift[];
  weekClosedMinutes: number;
  /** Jours pointés de la semaine, période ouverte comprise. */
  weekDays: number;
}) {
  const t = useTranslations("pointage");
  const tRoot = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const now = useNow();
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const open = shifts.find((s) => !s.clock_out) ?? null;
  const elapsed = open ? shiftMinutes(open, now) : 0;
  const todayMinutes = shifts
    .filter((s) => s.work_date === today)
    .reduce((sum, s) => sum + shiftMinutes(s, now), 0);
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
    <div className="space-y-6">
      <section className="border-border bg-card rounded-lg border p-4">
        <div className="flex items-center justify-between gap-3">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 text-xs leading-6 font-medium",
              open ? "bg-success-soft text-success-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            <span
              aria-hidden
              className={cn("size-1.5 rounded-full", open ? "bg-success" : "bg-muted-foreground")}
            />
            {open
              ? t("onDutySince", { time: formatTime(open.clock_in, locale) })
              : t("offDuty")}
          </span>
          <span className="text-muted-foreground text-xs">
            {formatLongDay(`${today}T12:00:00+01:00`, locale)}
          </span>
        </div>

        {open && (
          <div className="mt-5 text-center">
            <p className="text-muted-foreground text-xs">{t("elapsed")}</p>
            <p
              className="font-heading tabular mt-1 text-4xl font-medium"
              aria-live="polite"
              suppressHydrationWarning
            >
              {formatDuration(elapsed, locale)}
            </p>
            {open.work_date !== today && (
              <p className="text-warning-foreground mt-1 text-xs">
                {t("startedOn", { date: formatDayMonth(open.clock_in, locale) })}
              </p>
            )}
          </div>
        )}

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
      </section>

      <div className="ornament" aria-hidden>
        <span className="ornament-diamond" />
      </div>

      <section aria-labelledby="pointage-today">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h2 id="pointage-today" className="text-base font-medium">
            {t("today")}
          </h2>
          <span className="tabular text-sm font-medium" suppressHydrationWarning>
            {formatDuration(todayMinutes, locale)}
          </span>
        </div>

        {shifts.length === 0 ? (
          <p className="text-muted-foreground border-border rounded-lg border border-dashed py-6 text-center text-sm">
            {t("noShiftToday")}
          </p>
        ) : (
          <ul className="border-border divide-border divide-y rounded-lg border">
            {shifts.map((shift) => (
              <ShiftLine key={shift.id} shift={shift} now={now} locale={locale} />
            ))}
          </ul>
        )}

        <div className="text-muted-foreground mt-3 flex items-baseline justify-between gap-3 text-sm">
          <span>{t("week")}</span>
          <span className="tabular" suppressHydrationWarning>
            <span className="text-foreground font-medium">{formatDuration(weekMinutes, locale)}</span>
            {" · "}
            {t("days", { count: weekDays })}
          </span>
        </div>
      </section>

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

/** Une période : « 08:58 → 12:30 · 3 h 32 ». Partagée avec le détail du mois. */
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
  return (
    <li className="flex min-h-12 items-center gap-3 py-2 ps-3 pe-3 text-sm">
      <span className="tabular flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-0.5">
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
