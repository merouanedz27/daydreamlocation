"use client";

import { useRef, useState, useTransition } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { DatePicker } from "@/components/date-picker";
import { sendOrQueue } from "@/lib/offline/outbox";
import { updateExpense } from "@/lib/actions/expenses";
import type { ExpenseCategory } from "@/lib/validation/expenses";
import type { ExpenseRow } from "@/lib/queries/expenses";
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

type QuickType = (typeof QUICK_TYPES)[number];
type FormError = { field: string | null; key: string } | null;

/**
 * Les champs du frais, partagés par l'ajout et la correction : montant, type,
 * détail, date. `idPrefix` sépare les `id` des deux tiroirs, qui peuvent être
 * montés sur la même page.
 *
 * `type` à `null` : la catégorie n'est pas un des quatre types rapides (un
 * salaire versé par le pointage, un loyer…). Elle s'affiche alors en lecture
 * seule — la correction ne la change pas.
 */
function FraisFields({
  idPrefix,
  amountRef,
  amount,
  onAmount,
  type,
  onType,
  fixedCategory,
  detail,
  onDetail,
  spentOn,
  onSpentOn,
  error,
}: {
  idPrefix: string;
  amountRef: React.RefObject<HTMLInputElement | null>;
  amount: string;
  onAmount: (v: string) => void;
  type: QuickType | null;
  onType: (v: QuickType) => void;
  fixedCategory?: ExpenseCategory;
  detail: string;
  onDetail: (v: string) => void;
  spentOn: string;
  onSpentOn: (v: string) => void;
  error: FormError;
}) {
  const t = useTranslations();

  return (
    <FieldGroup>
      <Field data-invalid={error?.field === "amount" || undefined}>
        <FieldLabel htmlFor={`${idPrefix}-amount`}>
          {t("expenses.amount")}
        </FieldLabel>
        <Input
          ref={amountRef}
          id={`${idPrefix}-amount`}
          type="number"
          inputMode="numeric"
          min={0}
          step={50}
          value={amount}
          onChange={(e) => onAmount(e.target.value)}
          enterKeyHint="done"
          className="tabular h-14 text-xl"
          aria-invalid={error?.field === "amount" || undefined}
        />
        {error?.field === "amount" && <FieldError>{t(error.key)}</FieldError>}
      </Field>

      <Field>
        <FieldLabel id={`${idPrefix}-type-label`}>{t("frais.type")}</FieldLabel>
        {type ? (
          <div
            role="radiogroup"
            aria-labelledby={`${idPrefix}-type-label`}
            className="grid grid-cols-2 gap-2"
          >
            {QUICK_TYPES.map((option) => {
              const active = option.key === type.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onType(option)}
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
        ) : (
          fixedCategory && (
            <p
              className="border-border bg-muted text-muted-foreground flex min-h-12 items-center rounded-lg border px-3 text-sm"
            >
              {t(`expenses.categories.${fixedCategory}`)}
            </p>
          )
        )}
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-detail`}>{t("frais.detail")}</FieldLabel>
        <Input
          id={`${idPrefix}-detail`}
          value={detail}
          onChange={(e) => onDetail(e.target.value)}
          placeholder={t("frais.detailPlaceholder")}
          maxLength={300}
          autoComplete="off"
          className="h-12 text-base"
        />
      </Field>

      <Field data-invalid={error?.field === "spent_on" || undefined}>
        <FieldLabel htmlFor={`${idPrefix}-date`}>{t("expenses.date")}</FieldLabel>
        <DatePicker
          id={`${idPrefix}-date`}
          value={spentOn}
          onChange={(v) => onSpentOn(v || todayIso())}
        />
      </Field>

      {error && error.field !== "amount" && (
        <p role="alert" className="text-destructive text-sm">
          {t(error.key)}
        </p>
      )}
    </FieldGroup>
  );
}

/**
 * Le formulaire « Frais » de son AppSheet : un montant, un type, la date du
 * jour. Trois champs, un bouton — l'employé note le tailleur au moment où il
 * le paie, sans quitter le comptoir.
 *
 * Il s'ouvre dans un tiroir BAS, pour laisser l'écran à la liste : sur
 * téléphone par le bouton rond « + » (comme sur les commandes), sur grand
 * écran par un bouton en haut de page.
 *
 * Après l'ajout, le tiroir se ferme et le formulaire se vide mais GARDE le
 * type : on note souvent plusieurs pressings à la suite.
 */
export function FraisAddDrawer() {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [type, setType] = useState(QUICK_TYPES[0]);
  const [amount, setAmount] = useState("");
  const [detail, setDetail] = useState("");
  const [spentOn, setSpentOn] = useState(todayIso);
  const [error, setError] = useState<FormError>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!(Number(amount) > 0)) {
      setError({ field: "amount", key: "errors.required" });
      amountRef.current?.focus();
      return;
    }

    // Sans détail, le libellé du type sert de description : la liste dit
    // « Tailleur », pas « Retouche ».
    const description = detail.trim() || t(`frais.types.${type.key}`);
    const value = Number(amount);

    startTransition(async () => {
      // Sans réseau, le frais attend dans la file ; son identifiant empêche
      // qu'un renvoi ne le note deux fois.
      const result = await sendOrQueue(
        {
          kind: "expense",
          spent_on: spentOn,
          category: type.category,
          amount: value,
          description,
          order_id: null,
          opId: crypto.randomUUID(),
        },
        `${description} · ${formatMoney(value, locale)}`,
      );
      if (!result.ok) {
        setError({ field: result.field ?? null, key: result.error });
        return;
      }
      if (result.queued) toast(t("offline.queuedToast"));
      else
        toast.success(
          t("frais.added", {
            label: description,
            amount: formatMoney(value, locale),
          }),
        );
      setAmount("");
      setDetail("");
      setOpen(false);
    });
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-11 md:inline-flex"
      >
        <Plus className="size-4" aria-hidden />
        {t("frais.add")}
      </Button>

      {/* Le bouton rond de `NewOrderFab`, à la même place : au-dessus de la
          barre d'onglets, côté fin. La page réserve sa hauteur en bas, pour
          qu'il ne masque pas la dernière ligne de la liste. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("frais.add")}
        title={t("frais.add")}
        className="bg-primary text-primary-foreground focus-visible:ring-ring fixed end-4 bottom-[calc(3.5rem+env(safe-area-inset-bottom)+1rem)] z-40 flex size-14 items-center justify-center rounded-full shadow-lg transition-transform focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-95 md:hidden"
      >
        <Plus className="size-7" aria-hidden />
      </button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="max-h-[92svh]">
          <DrawerHeader className="text-start">
            <DrawerTitle>{t("frais.add")}</DrawerTitle>
            <DrawerDescription>{t("frais.hint")}</DrawerDescription>
          </DrawerHeader>

          <form
            onSubmit={onSubmit}
            noValidate
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex-1 overflow-y-auto px-4">
              <FraisFields
                idPrefix="f"
                amountRef={amountRef}
                amount={amount}
                onAmount={setAmount}
                type={type}
                onType={setType}
                detail={detail}
                onDetail={setDetail}
                spentOn={spentOn}
                onSpentOn={setSpentOn}
                error={error}
              />
            </div>

            <DrawerFooter>
              <Button
                type="submit"
                disabled={isPending}
                className="h-12 text-base"
              >
                {isPending ? (
                  <Spinner />
                ) : (
                  <Plus className="size-4" aria-hidden />
                )}
                {t("frais.add")}
              </Button>
            </DrawerFooter>
          </form>
        </DrawerContent>
      </Drawer>
    </>
  );
}

/**
 * Correction d'un frais — propriétaire seul (`updateExpense` le vérifie, la
 * RLS aussi). Le même tiroir que l'ajout, pré-rempli.
 *
 * Le formulaire vit DANS le contenu du tiroir, qui se démonte à la fermeture :
 * chaque ouverture repart de la dépense visée, sans effet de synchronisation.
 */
export function FraisEditDrawer({
  expense,
  open,
  onOpenChange,
}: {
  expense: ExpenseRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92svh]">
        <DrawerHeader className="text-start">
          <DrawerTitle>{t("frais.edit")}</DrawerTitle>
          <DrawerDescription>{t("frais.hint")}</DrawerDescription>
        </DrawerHeader>

        {expense && (
          <FraisEditForm
            key={expense.id}
            expense={expense}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DrawerContent>
    </Drawer>
  );
}

function FraisEditForm({
  expense,
  onDone,
}: {
  expense: ExpenseRow;
  onDone: () => void;
}) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const [isPending, startTransition] = useTransition();
  const category = expense.category as ExpenseCategory;
  const [type, setType] = useState<QuickType | null>(
    () => QUICK_TYPES.find((q) => q.category === category) ?? null,
  );
  const [amount, setAmount] = useState(() => String(Number(expense.amount)));
  const [detail, setDetail] = useState(expense.description ?? "");
  const [spentOn, setSpentOn] = useState(expense.spent_on);
  const [error, setError] = useState<FormError>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!(Number(amount) > 0)) {
      setError({ field: "amount", key: "errors.required" });
      amountRef.current?.focus();
      return;
    }

    // Même règle qu'à l'ajout : sans détail, le libellé du type (ou de la
    // catégorie, si elle n'est pas un type rapide) sert de description.
    const description =
      detail.trim() ||
      (type
        ? t(`frais.types.${type.key}`)
        : t(`expenses.categories.${category}`));
    const value = Number(amount);

    const data = new FormData();
    data.set("id", String(expense.id));
    data.set("locale", locale);
    data.set("spent_on", spentOn);
    data.set("category", type?.category ?? category);
    data.set("amount", String(value));
    data.set("description", description);

    startTransition(async () => {
      const result = await updateExpense(data);
      if (!result.ok) {
        setError({ field: result.field ?? null, key: result.error });
        return;
      }
      toast.success(
        t("frais.updated", {
          label: description,
          amount: formatMoney(value, locale),
        }),
      );
      onDone();
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto px-4">
        <FraisFields
          idPrefix="fe"
          amountRef={amountRef}
          amount={amount}
          onAmount={setAmount}
          type={type}
          onType={setType}
          fixedCategory={category}
          detail={detail}
          onDetail={setDetail}
          spentOn={spentOn}
          onSpentOn={setSpentOn}
          error={error}
        />
      </div>

      <DrawerFooter>
        <Button type="submit" disabled={isPending} className="h-12 text-base">
          {isPending ? <Spinner /> : <Pencil className="size-4" aria-hidden />}
          {t("common.save")}
        </Button>
      </DrawerFooter>
    </form>
  );
}
