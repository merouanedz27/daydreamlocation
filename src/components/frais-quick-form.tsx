"use client";

import { useRef, useState, useTransition } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { DatePicker } from "@/components/date-picker";
import { createExpense } from "@/lib/actions/expenses";
import type { ExpenseCategory } from "@/lib/validation/expenses";
import { formatMoney } from "@/lib/format";
import { todayIso } from "@/lib/rental-range";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/routing";

/**
 * Les « types » qu'on lit dans son onglet Frais — tailleur, pressing,
 * livraison — rangés dans les catégories du bilan. Un toucher remplace la
 * liste déroulante : c'est le même geste à chaque fois.
 */
const QUICK_TYPES: { key: string; category: ExpenseCategory }[] = [
  { key: "tailor", category: "retouche" },
  { key: "pressing", category: "nettoyage" },
  { key: "delivery", category: "transport" },
  { key: "other", category: "autre" },
];

/**
 * Le formulaire « Frais » de son AppSheet : un montant, un type, la date du
 * jour. Trois champs, un bouton — l'employé note le tailleur au moment où il
 * le paie, sans quitter le comptoir.
 *
 * Après l'ajout, le formulaire se vide mais GARDE le type : on note souvent
 * plusieurs pressings à la suite.
 */
export function FraisQuickForm() {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const [isPending, startTransition] = useTransition();
  const [type, setType] = useState(QUICK_TYPES[0]);
  const [amount, setAmount] = useState("");
  const [detail, setDetail] = useState("");
  const [spentOn, setSpentOn] = useState(todayIso);
  const [error, setError] = useState<{ field: string | null; key: string } | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!(Number(amount) > 0)) {
      setError({ field: "amount", key: "errors.required" });
      amountRef.current?.focus();
      return;
    }

    const data = new FormData();
    data.set("locale", locale);
    data.set("spent_on", spentOn);
    data.set("category", type.category);
    data.set("amount", amount);
    // Sans détail, le libellé du type sert de description : la liste dit
    // « Tailleur », pas « Retouche ».
    data.set("description", detail.trim() || t(`frais.types.${type.key}`));

    startTransition(async () => {
      const result = await createExpense(data);
      if (!result.ok) {
        setError({ field: result.field ?? null, key: result.error });
        return;
      }
      toast.success(
        t("frais.added", {
          label: detail.trim() || t(`frais.types.${type.key}`),
          amount: formatMoney(Number(amount), locale),
        }),
      );
      setAmount("");
      setDetail("");
      amountRef.current?.focus();
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="border-border bg-card rounded-lg border p-4">
      <FieldGroup>
        <Field data-invalid={error?.field === "amount" || undefined}>
          <FieldLabel htmlFor="f-amount">{t("expenses.amount")}</FieldLabel>
          <Input
            ref={amountRef}
            id="f-amount"
            type="number"
            inputMode="numeric"
            min={0}
            step={50}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            enterKeyHint="done"
            className="tabular h-14 text-xl"
            aria-invalid={error?.field === "amount" || undefined}
          />
          {error?.field === "amount" && <FieldError>{t(error.key)}</FieldError>}
        </Field>

        <Field>
          <FieldLabel id="f-type-label">{t("frais.type")}</FieldLabel>
          <div role="radiogroup" aria-labelledby="f-type-label" className="grid grid-cols-2 gap-2">
            {QUICK_TYPES.map((option) => {
              const active = option.key === type.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setType(option)}
                  className={cn(
                    "min-h-12 rounded-lg border px-3 text-sm transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground font-medium"
                      : "border-border bg-background hover:border-gold-strong",
                  )}
                >
                  {t(`frais.types.${option.key}`)}
                </button>
              );
            })}
          </div>
        </Field>

        <Field>
          <FieldLabel htmlFor="f-detail">{t("frais.detail")}</FieldLabel>
          <Input
            id="f-detail"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder={t("frais.detailPlaceholder")}
            maxLength={300}
            autoComplete="off"
            className="h-12 text-base"
          />
        </Field>

        <Field data-invalid={error?.field === "spent_on" || undefined}>
          <FieldLabel htmlFor="f-date">{t("expenses.date")}</FieldLabel>
          <DatePicker id="f-date" value={spentOn} onChange={(v) => setSpentOn(v || todayIso())} />
        </Field>

        {error && error.field !== "amount" && (
          <p role="alert" className="text-destructive text-sm">
            {t(error.key)}
          </p>
        )}

        <Button type="submit" disabled={isPending} className="h-12 text-base">
          {isPending ? <Spinner /> : <Plus className="size-4" aria-hidden />}
          {t("frais.add")}
        </Button>
      </FieldGroup>
    </form>
  );
}
