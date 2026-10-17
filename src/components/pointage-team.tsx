"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Banknote, Check, ChevronRight, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PointageCounter, PointageDays } from "@/components/pointage-days";
import { payWorker } from "@/lib/actions/pointage";
import { formatDayMonth } from "@/lib/format";
import { noon, type WorkerPeriod } from "@/lib/pointage";
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
 * L'équipe vue par le propriétaire : une carte par employé, son nombre de
 * jours depuis la dernière paie, et s'il a coché aujourd'hui.
 *
 * Toucher une carte ouvre son tableau (toutes les cases non payées se
 * corrigent) et le bouton « Payé » : un ConfirmDialog, puis le compteur
 * repart à zéro. La paie n'efface rien — elle reste dans « Derniers
 * paiements ».
 */
export function PointageTeam({ today, team }: { today: string; team: WorkerPeriod[] }) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const [openId, setOpenId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);

  if (team.length === 0) {
    return (
      <p className="text-muted-foreground border-border rounded-lg border border-dashed py-8 text-center text-sm">
        {t("pointage.empty")}
      </p>
    );
  }

  const worker = team.find((w) => w.id === openId) ?? null;
  const since = (w: WorkerPeriod) => formatDayMonth(noon(w.start), locale);

  async function onPay() {
    if (!worker) return;
    const result = await payWorker(locale, worker.id);
    if (!result.ok) return result;
    toast.success(t("pointage.paid", { name: worker.full_name, count: result.days }));
    return { ok: true };
  }

  return (
    <>
      <ul className="space-y-1.5">
        {team.map((w) => {
          const here = w.checked.includes(today);
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
                  <span className="block truncate text-sm font-medium">{w.full_name}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs">
                    {here ? (
                      <span className="text-success-foreground inline-flex items-center gap-1 font-medium">
                        <Check className="size-3.5" aria-hidden />
                        {t("pointage.checkedToday")}
                      </span>
                    ) : (
                      <span className="text-muted-foreground inline-flex items-center gap-1">
                        <Minus className="size-3.5" aria-hidden />
                        {t("pointage.notYet")}
                      </span>
                    )}
                    <span className="text-muted-foreground">
                      · {t("pointage.since", { date: since(w) })}
                    </span>
                  </span>
                </span>
                <span className="font-heading tabular shrink-0 text-lg font-medium">
                  {t("pointage.countShort", { count: w.checked.length })}
                </span>
                <ChevronRight className="text-muted-foreground size-4 shrink-0 rtl:-scale-x-100" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent className="max-h-[92svh]">
          <DrawerHeader className="text-start">
            <DrawerTitle>{worker?.full_name}</DrawerTitle>
            <DrawerDescription>{t("pointage.hintOwner")}</DrawerDescription>
          </DrawerHeader>

          {worker && (
            <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-4">
              <PointageCounter count={worker.checked.length} start={worker.start} />

              <Button
                type="button"
                className="h-12 w-full text-base"
                onClick={() => setPayOpen(true)}
              >
                <Banknote className="size-4" aria-hidden />
                {t("pointage.pay")}
              </Button>

              <PointageDays
                key={`${worker.id}-${worker.start}`}
                mode="owner"
                userId={worker.id}
                start={worker.start}
                today={today}
                checked={worker.checked}
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
                        <span className="tabular font-medium">
                          {t("pointage.count", { count: r.days_count })}
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

      <ConfirmDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        tone="default"
        icon={<Banknote className="size-4" />}
        title={worker ? t("pointage.payTitle", { name: worker.full_name }) : ""}
        description={
          worker
            ? t("pointage.payBody", { count: worker.checked.length, date: since(worker) })
            : undefined
        }
        confirmLabel={t("pointage.pay")}
        onConfirm={onPay}
      />
    </>
  );
}
