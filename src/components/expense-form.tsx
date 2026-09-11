"use client";

import { useState, useTransition } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertCircle, Plus } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createExpense } from "@/lib/actions/expenses";
import { EXPENSE_CATEGORIES } from "@/lib/validation/expenses";
import { formatDate } from "@/lib/format";
import type { Locale } from "@/i18n/routing";

export type OrderOption = {
  id: number;
  order_no: string;
  customer_name: string;
  event_date: string;
};

export function ExpenseForm({ orders }: { orders: OrderOption[] }) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [field, setField] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  function onSubmit(formData: FormData) {
    setError(null);
    setField(null);
    startTransition(async () => {
      const result = await createExpense(formData);
      if (result.ok) {
        setOpen(false);
        return;
      }
      setError(result.error);
      setField(result.field ?? null);
    });
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button className="h-11">
          <Plus className="size-4" aria-hidden />
          {t("expenses.add")}
        </Button>
      </DrawerTrigger>

      <DrawerContent className="max-h-[92svh]">
        <DrawerHeader className="text-start">
          <DrawerTitle>{t("expenses.add")}</DrawerTitle>
          <DrawerDescription>{t("expenses.addHint")}</DrawerDescription>
        </DrawerHeader>

        <form action={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <input type="hidden" name="locale" value={locale} />

          <div className="flex-1 overflow-y-auto px-4">
            <FieldGroup>
              <Field data-invalid={field === "amount" || undefined}>
                <FieldLabel htmlFor="amount">{t("expenses.amount")}</FieldLabel>
                <Input
                  id="amount"
                  name="amount"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={100}
                  required
                  disabled={isPending}
                  className="h-12 text-base"
                />
                {field === "amount" && error && <FieldError>{t(error)}</FieldError>}
              </Field>

              <Field data-invalid={field === "category" || undefined}>
                <FieldLabel htmlFor="category">{t("expenses.category")}</FieldLabel>
                <Select name="category" defaultValue="autre" disabled={isPending}>
                  <SelectTrigger id="category" className="h-12 w-full text-base">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {t(`expenses.categories.${c}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {field === "category" && error && <FieldError>{t(error)}</FieldError>}
              </Field>

              <Field data-invalid={field === "spent_on" || undefined}>
                <FieldLabel htmlFor="spent_on">{t("expenses.date")}</FieldLabel>
                <Input
                  id="spent_on"
                  name="spent_on"
                  type="date"
                  defaultValue={today}
                  required
                  disabled={isPending}
                  className="h-12 text-base"
                />
                {field === "spent_on" && error && <FieldError>{t(error)}</FieldError>}
              </Field>

              <Field>
                <FieldLabel htmlFor="description">{t("expenses.description")}</FieldLabel>
                <Input
                  id="description"
                  name="description"
                  disabled={isPending}
                  className="h-12 text-base"
                />
              </Field>

              {/* « Les frais » du tableur : retouche et pressing sont facturés
                  PAR COMMANDE. Laisser vide pour une charge générale. */}
              <Field>
                <FieldLabel htmlFor="order_id">{t("expenses.linkedOrder")}</FieldLabel>
                <Select name="order_id" defaultValue="" disabled={isPending}>
                  <SelectTrigger id="order_id" className="h-12 w-full text-base">
                    <SelectValue placeholder={t("expenses.noOrder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {orders.map((o) => (
                      <SelectItem key={o.id} value={String(o.id)}>
                        {o.order_no} · {o.customer_name} ·{" "}
                        {formatDate(o.event_date, locale)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>{t("expenses.linkedOrderHint")}</FieldDescription>
              </Field>

              {error && !field && (
                <Alert variant="destructive">
                  <AlertCircle />
                  <AlertDescription>{t(error)}</AlertDescription>
                </Alert>
              )}
            </FieldGroup>
          </div>

          <DrawerFooter>
            <Button type="submit" disabled={isPending} className="h-12 w-full text-base">
              {isPending && <Spinner />}
              {t("common.save")}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
