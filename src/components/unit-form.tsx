"use client";

import { useState, useTransition } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import { createUnits } from "@/lib/actions/stock";
import type { Locale } from "@/i18n/routing";

const CONDITIONS = ["neuf", "bon", "use", "retire"] as const;

export function UnitForm({
  modelId,
  refCode,
  nextRef,
}: {
  modelId: number;
  refCode: string;
  nextRef: string;
}) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [field, setField] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    setField(null);
    startTransition(async () => {
      const result = await createUnits(formData);
      if (result && !result.ok) {
        setError(result.error);
        setField(result.field ?? null);
      }
    });
  }

  return (
    <form action={onSubmit} noValidate>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="model_id" value={modelId} />

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="size">{t("stock.size")}</FieldLabel>
          <Input
            id="size"
            name="size"
            disabled={isPending}
            placeholder="50"
            className="h-12 text-base"
          />
          <FieldDescription>{t("stock.sizeHint")}</FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="length_cm">{t("stock.length")}</FieldLabel>
          <Input
            id="length_cm"
            name="length_cm"
            type="number"
            inputMode="numeric"
            min={0}
            step={0.5}
            disabled={isPending}
            placeholder="90"
            className="h-12 text-base"
          />
        </Field>

        <Field data-invalid={field === "quantity" || undefined}>
          <FieldLabel htmlFor="quantity">{t("stock.quantity")}</FieldLabel>
          <Input
            id="quantity"
            name="quantity"
            type="number"
            inputMode="numeric"
            min={1}
            max={20}
            defaultValue={1}
            disabled={isPending}
            className="h-12 text-base"
          />
          {/* Les références sont dérivées du code fournisseur : on montre
              celle qui sera attribuée, pour qu'il n'y ait pas de surprise. */}
          <FieldDescription>
            {t("stock.nextRefHint", { ref: nextRef })}
          </FieldDescription>
          {field === "quantity" && error && <FieldError>{t(error)}</FieldError>}
        </Field>

        <Field>
          <FieldLabel htmlFor="price_override">{t("stock.priceOverride")}</FieldLabel>
          <Input
            id="price_override"
            name="price_override"
            type="number"
            inputMode="numeric"
            min={0}
            step={100}
            disabled={isPending}
            className="h-12 text-base"
          />
          <FieldDescription>{t("stock.priceOverrideHint")}</FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="purchase_price">{t("stock.purchasePrice")}</FieldLabel>
          <Input
            id="purchase_price"
            name="purchase_price"
            type="number"
            inputMode="numeric"
            min={0}
            step={100}
            disabled={isPending}
            className="h-12 text-base"
          />
          <FieldDescription>{t("stock.purchasePriceHint")}</FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="condition">{t("stock.condition")}</FieldLabel>
          <Select name="condition" defaultValue="bon" disabled={isPending}>
            <SelectTrigger id="condition" className="h-12 w-full text-base">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONDITIONS.map((c) => (
                <SelectItem key={c} value={c}>
                  {t(`stock.conditions.${c}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {error && !field && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{t(error)}</AlertDescription>
          </Alert>
        )}
      </FieldGroup>

      <div className="bg-background border-border pb-safe sticky bottom-0 mt-6 border-t py-3">
        <Button type="submit" disabled={isPending} className="h-12 w-full text-base">
          {isPending && <Spinner />}
          {t("stock.addPiece")}
        </Button>
        <p className="text-muted-foreground mt-2 text-center text-xs">
          <bdi>{refCode}</bdi>
        </p>
      </div>
    </form>
  );
}
