"use client";

import { useState, useTransition } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Banknote, Check, ChevronRight, Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { DatePicker } from "@/components/date-picker";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { PointageCounter, PointageDays } from "@/components/pointage-days";
import { PointagePay } from "@/components/pointage-pay";
import { setPayType, setWorkStartDate } from "@/lib/actions/pointage";
import { formatDate, formatDayMonth, formatMoney } from "@/lib/format";
import { markKind, noon, PAY_TYPES, type WorkerPeriod } from "@/lib/pointage";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/routing";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * L'équipe vue par le propriétaire : une carte par employé — ses jours
 * payables depuis la dernière paie, et s'il est là aujourd'hui. Un remplaçant
 * porte son étiquette : on le compte à ses présences, pas à ses absences.
 *
 * Toucher une carte ouvre sa fiche : permanent ou remplaçant, sa date de
 * début de travail, son tableau (toutes les cases non payées se corrigent) et
 * le bouton « Payer ». La paie n'efface rien — elle reste dans « Derniers
 * paiements ».
 */
export function PointageTeam({
  today,
  team,
}: {
  today: string;
  team: WorkerPeriod[];
}) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const [openId, setOpenId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);

  const worker = team.find((w) => w.id === openId) ?? null;
  // Payé ce soir, ou embauché la semaine prochaine : on affiche aujourd'hui.
  const shownStart = (w: WorkerPeriod) => (w.start > today ? today : w.start);
  const since = (w: WorkerPeriod) => formatDayMonth(noon(shownStart(w)), locale);

  return (
    <>
      {team.length === 0 ? (
        <p className="text-muted-foreground border-border rounded-lg border border-dashed py-8 text-center text-sm">
          {t("pointage.empty")}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {team.map((w) => {
            const presence = w.payType === "remplacant";
            const markedToday = w.marks.includes(today);
            return (
              <li key={w.id}>
                <button
                  type="button"
                  onClick={() => {
                    setOpenId(w.id);
                    setDrawerOpen(true);
                  }}
                  className="border-border bg-card hover:border-gold-strong flex min-h-16 w-full items-center gap-3 rounded-lg border py-2 ps-3 pe-2 text-start transition-colors"
                >
                  <span
                    aria-hidden
                    className="bg-gold-soft text-foreground flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-medium"
                  >
                    {initials(w.full_name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{w.full_name}</span>
                      {presence && (
                        <span className="bg-warning-soft text-warning-foreground shrink-0 rounded-full px-1.5 text-[11px] leading-5">
                          {t("pointage.payType.remplacant")}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs">
                      {presence ? (
                        markedToday ? (
                          <span className="text-success-foreground inline-flex items-center gap-1">
                            <Check className="size-3.5" aria-hidden />
                            {t("pointage.present")}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">{t("pointage.notCameToday")}</span>
                        )
                      ) : markedToday ? (
                        <span className="text-destructive inline-flex items-center gap-1 font-medium">
                          <X className="size-3.5" aria-hidden />
                          {t("pointage.absentToday")}
                        </span>
                      ) : (
                        <span className="text-success-foreground inline-flex items-center gap-1">
                          <Check className="size-3.5" aria-hidden />
                          {t("pointage.present")}
                        </span>
                      )}
                      <span className="text-muted-foreground">
                        · {t("pointage.since", { date: since(w) })}
                      </span>
                    </span>
                  </span>
                  <span className="font-heading tabular shrink-0 text-lg font-medium">
                    {t("pointage.countShort", { count: w.worked })}
                  </span>
                  <ChevronRight className="text-muted-foreground size-4 shrink-0 rtl:-scale-x-100" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent className="max-h-[92svh]">
          <DrawerHeader className="text-start">
            <DrawerTitle>{worker?.full_name}</DrawerTitle>
            <DrawerDescription>{t("pointage.hintOwner")}</DrawerDescription>
          </DrawerHeader>

          {worker && (
            <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-4">
              <PointageCounter
                kind={markKind(worker.payType)}
                worked={worker.worked}
                marks={worker.marks}
                start={shownStart(worker)}
              />

              <Button
                type="button"
                className="h-12 w-full text-base"
                onClick={() => setPayOpen(true)}
              >
                <Banknote className="size-4" aria-hidden />
                {t("pointage.pay")}
              </Button>

              <PayTypeField worker={worker} />

              <StartDateField key={`${worker.id}-${worker.workStartDate}`} worker={worker} />

              <PointageDays
                key={`${worker.id}-${worker.start}-${worker.payType}`}
                kind={markKind(worker.payType)}
                mode="owner"
                userId={worker.id}
                start={worker.start}
                today={today}
                marks={worker.marks}
                lockedThrough={worker.resets[0]?.paid_through ?? null}
              />

              {worker.resets.length > 0 && (
                <section aria-labelledby="pointage-history">
                  <h3 id="pointage-history" className="text-muted-foreground mb-1.5 text-xs font-medium">
                    {t("pointage.history")}
                  </h3>
                  <ul className="border-border divide-border divide-y rounded-lg border text-sm">
                    {worker.resets.map((r) => (
                      <li
                        key={`${r.paid_through}-${r.created_at}`}
                        className="flex min-h-11 items-center justify-between gap-3 px-3"
                      >
                        <span>
                          {t("pointage.historyRow", { date: formatDayMonth(noon(r.paid_through), locale) })}
                        </span>
                        <span className="tabular text-end">
                          <span className="text-muted-foreground">
                            {t("pointage.count", { count: r.days_count })}
                            {r.absences_count
                              ? ` · ${t("pointage.absences", { count: r.absences_count })}`
                              : ""}
                            {r.daily_rate !== null && r.pay_type !== null
                              ? ` × ${formatMoney(Number(r.daily_rate), locale)}`
                              : ""}
                          </span>
                          {r.amount !== null && (
                            <span className="ms-2 font-medium">{formatMoney(Number(r.amount), locale)}</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </DrawerContent>
      </Drawer>

      {worker && (
        <PointagePay
          open={payOpen}
          onOpenChange={setPayOpen}
          worker={worker}
          since={since(worker)}
        />
      )}
    </>
  );
}

/**
 * Permanent ou remplaçant : deux boutons côte à côte, 44 px, le choix actif
 * plein. Ce n'est pas un rôle — les droits dans l'app ne bougent pas.
 * Changer en cours de période fait compter l'autre tableau : on le dit.
 */
function PayTypeField({ worker }: { worker: WorkerPeriod }) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const [isPending, startTransition] = useTransition();

  function choose(next: (typeof PAY_TYPES)[number]) {
    if (next === worker.payType) return;
    startTransition(async () => {
      const result = await setPayType(locale, worker.id, next);
      if (!result.ok) {
        toast.error(t(result.error));
        return;
      }
      toast.success(t(`pointage.payTypeChanged.${next}`, { name: worker.full_name }));
    });
  }

  return (
    <Field>
      <FieldLabel id="pay-type-label">{t("pointage.payTypeLabel")}</FieldLabel>
      <div role="radiogroup" aria-labelledby="pay-type-label" className="grid grid-cols-2 gap-1.5">
        {PAY_TYPES.map((type) => {
          const active = worker.payType === type;
          return (
            <Button
              key={type}
              type="button"
              role="radio"
              aria-checked={active}
              variant={active ? "default" : "outline"}
              disabled={isPending}
              onClick={() => choose(type)}
              className={cn("h-11 text-sm", active && "pointer-events-none")}
            >
              {t(`pointage.payType.${type}`)}
            </Button>
          );
        })}
      </div>
      <FieldDescription>
        {worker.payType === "remplacant"
          ? t("pointage.payTypeHintRemplacant")
          : t("pointage.payTypeHintPermanent")}
      </FieldDescription>
    </Field>
  );
}

/**
 * Premier jour de travail : la paie ne compte rien avant. Indispensable pour
 * un employé déjà en poste avant l'application et jamais payé ici.
 */
function StartDateField({ worker }: { worker: WorkerPeriod }) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState(worker.workStartDate ?? "");
  const missing = !worker.workStartDate && worker.resets.length === 0;
  const lastPaid = worker.resets[0]?.paid_through ?? null;

  // Déjà payé ici : le compte repart du lendemain de la dernière paie, la
  // date de début ne sert plus — on montre ce qui compte vraiment.
  if (lastPaid) {
    return (
      <div className="border-border bg-muted/40 flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
        <span className="text-muted-foreground">{t("pointage.lastPaid")}</span>
        <span className="tabular text-end">
          <span className="font-medium">{formatDate(noon(lastPaid), locale)}</span>
          <span className="text-muted-foreground block text-xs">
            {t("pointage.countsFrom", {
              date: formatDate(noon(worker.start), locale),
            })}
          </span>
        </span>
      </div>
    );
  }

  function save(next: string) {
    if (next === (worker.workStartDate ?? "")) return;
    startTransition(async () => {
      const result = await setWorkStartDate(locale, worker.id, next || null);
      if (!result.ok) {
        toast.error(t(result.error));
        setDraft(worker.workStartDate ?? "");
      }
    });
  }

  return (
    <Field>
      <FieldLabel htmlFor="work-start-date">{t("pointage.startDate")}</FieldLabel>
      <DatePicker
        id="work-start-date"
        value={draft}
        onChange={(day) => {
          setDraft(day);
          save(day);
        }}
        placeholder={t("common.pickDate")}
        disabled={isPending}
        invalid={missing}
      />
      {missing ? (
        <p className="text-warning-foreground flex items-start gap-1.5 text-xs">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t("pointage.startDateMissing")}
        </p>
      ) : (
        <FieldDescription>{t("pointage.startDateHint")}</FieldDescription>
      )}
    </Field>
  );
}
