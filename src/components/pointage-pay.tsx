"use client";

import { useRef, useState, useTransition } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertCircle, Banknote } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { payWorker } from "@/lib/actions/pointage";
import { formatMoney } from "@/lib/format";
import { payAmount, type WorkerPeriod } from "@/lib/pointage";
import type { Locale } from "@/i18n/routing";

/**
 * La paie d'un employé : son salaire mensuel, le calcul sous les yeux —
 * jours dus − absences, × salaire ÷ N — puis un seul geste : le compteur
 * repart à zéro ET le total entre dans les frais (catégorie « Salaire »),
 * dans la même transaction. La base refait le calcul : c'est elle qui fait foi.
 *
 * Le salaire se préremplit avec celui de la dernière paie : d'un mois sur
 * l'autre, le propriétaire n'a qu'à vérifier le total.
 *
 * Tiroir et non `ConfirmDialog` : il faut un champ. Mêmes règles pourtant —
 * rien ne ferme pendant l'envoi, l'erreur s'affiche DANS le tiroir, le geste
 * sûr (« Annuler ») reste sous le pouce, en bas.
 */
export function PointagePay({
  open,
  onOpenChange,
  worker,
  monthDays,
  since,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  worker: WorkerPeriod;
  /** N : jours d'un mois de paie complet. */
  monthDays: number;
  /** « 01/10 » — début de la période payée. */
  since: string;
}) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const [isPending, startTransition] = useTransition();
  const lastRate = worker.resets.find((r) => r.monthly_salary !== null)?.monthly_salary ?? null;
  const [rate, setRate] = useState(lastRate ? String(lastRate) : "");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Chaque ouverture repart du dernier prix et efface l'échec précédent —
  // ajustement pendant le rendu, même motif que `ConfirmDialog`.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setRate(lastRate ? String(lastRate) : "");
      setError(null);
    }
  }

  const days = worker.worked;
  const price = Number(rate);
  const valid = rate.trim() !== "" && Number.isFinite(price) && price > 0;
  const total = valid ? payAmount(Math.round(price), days, monthDays) : 0;

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid) {
      setError("pointage.errors.salaryRequired");
      inputRef.current?.focus();
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await payWorker(locale, worker.id, price);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(
        t("pointage.paid", {
          name: worker.full_name,
          count: result.days,
          absences: result.absences,
          amount: formatMoney(result.amount, locale),
        }),
      );
      onOpenChange(false);
    });
  }

  return (
    <Drawer
      open={open}
      dismissible={!isPending}
      onOpenChange={(next) => {
        if (isPending && !next) return;
        onOpenChange(next);
      }}
    >
      <DrawerContent className="max-h-[92svh]">
        <DrawerHeader className="text-start">
          <DrawerTitle>{t("pointage.payTitle", { name: worker.full_name })}</DrawerTitle>
          <DrawerDescription>
            {t("pointage.payBody", { count: days, absences: worker.absences.length, date: since })}
          </DrawerDescription>
        </DrawerHeader>

        <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-4">
            <Field data-invalid={error === "pointage.errors.salaryRequired" || undefined}>
              <FieldLabel htmlFor="pay-rate">{t("pointage.salary")}</FieldLabel>
              <Input
                ref={inputRef}
                id="pay-rate"
                type="number"
                inputMode="numeric"
                min={0}
                step={100}
                autoFocus
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                disabled={isPending}
                aria-invalid={error === "pointage.errors.salaryRequired" || undefined}
                className="tabular h-14 text-xl"
              />
              <FieldDescription>{t("pointage.salaryHint", { count: monthDays })}</FieldDescription>
            </Field>

            {/* Le calcul en clair : c'est exactement ce que le propriétaire
                va compter en billets. */}
            <dl className="border-border bg-muted/40 mt-4 space-y-2 rounded-lg border p-3 text-sm">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted-foreground">{t("pointage.daysDue")}</dt>
                <dd className="tabular">{t("pointage.count", { count: worker.due })}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted-foreground">{t("pointage.absencesLabel")}</dt>
                <dd className="tabular">− {t("pointage.count", { count: worker.absences.length })}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted-foreground">{t("pointage.daysLabel")}</dt>
                <dd className="tabular font-medium">{t("pointage.count", { count: days })}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted-foreground">{t("pointage.perDay", { count: monthDays })}</dt>
                <dd className="tabular">
                  {valid ? formatMoney(Math.round(price) / monthDays, locale) : "—"}
                </dd>
              </div>
              <div className="border-border flex items-baseline justify-between gap-4 border-t pt-2">
                <dt className="font-medium">{t("pointage.total")}</dt>
                <dd className="font-heading tabular text-xl font-medium">
                  {formatMoney(total, locale)}
                </dd>
              </div>
            </dl>
            <p className="text-muted-foreground mt-2 text-xs">{t("pointage.toFrais")}</p>

            {error && (
              <Alert variant="destructive" className="mt-4">
                <AlertCircle />
                <AlertDescription>{t(error)}</AlertDescription>
              </Alert>
            )}
          </div>

          <DrawerFooter>
            <Button type="submit" disabled={isPending} className="h-12 w-full text-base">
              {isPending ? <Spinner /> : <Banknote className="size-4" aria-hidden />}
              {valid ? t("pointage.payAmount", { amount: formatMoney(total, locale) }) : t("pointage.pay")}
            </Button>
            <DrawerClose asChild>
              <Button type="button" variant="ghost" disabled={isPending} className="h-12 w-full text-base">
                {t("common.cancel")}
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
