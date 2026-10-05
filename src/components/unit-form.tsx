"use client";

import { useState, useTransition } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertCircle, Plus, X } from "lucide-react";
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
import { sizeSeries, sortSizes } from "@/lib/sizes";
import { nextUnitRefs } from "@/lib/stock-refs";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/routing";

const CONDITIONS = ["neuf", "bon", "use", "retire"] as const;

/**
 * Ajout de pièces EN SÉRIE : on touche chaque taille reçue (46, 48, 50…), une
 * pièce est créée par taille, avec sa référence. Sans taille cochée, le
 * nombre d'exemplaires reprend la main (pièces sans taille).
 */
export function UnitForm({
  modelId,
  refCode,
  existingRefs,
  categorySlug,
}: {
  modelId: number;
  refCode: string;
  /** Références déjà prises : la prévisualisation annonce les suivantes. */
  existingRefs: string[];
  categorySlug: string | null;
}) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [field, setField] = useState<string | null>(null);
  const [sizes, setSizes] = useState<string[]>([]);
  const [other, setOther] = useState("");
  const series = sizeSeries(categorySlug);
  // Les tailles libres ajoutées s'affichent comme les autres, à la suite.
  const chips = sortSizes([...series, ...sizes]);
  const chosen = sortSizes(sizes);
  const refs = nextUnitRefs(refCode, existingRefs, Math.max(chosen.length, 1));

  function toggle(size: string) {
    setSizes((current) =>
      current.includes(size) ? current.filter((s) => s !== size) : [...current, size],
    );
  }

  function addOther() {
    const size = other.trim().slice(0, 20);
    if (size && !sizes.includes(size)) setSizes((current) => [...current, size]);
    setOther("");
  }

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
          <FieldLabel>{t("stock.sizeSeries")}</FieldLabel>
          {chosen.map((size) => (
            <input key={size} type="hidden" name="sizes" value={size} />
          ))}
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label={t("stock.sizeSeries")}>
              {chips.map((size) => {
                const on = sizes.includes(size);
                return (
                  <button
                    key={size}
                    type="button"
                    aria-pressed={on}
                    disabled={isPending}
                    onClick={() => toggle(size)}
                    className={cn(
                      "press tabular flex h-11 min-w-12 items-center justify-center gap-1 rounded-full border px-3 text-base font-medium",
                      on
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border hover:bg-muted",
                    )}
                  >
                    <bdi>{size}</bdi>
                    {on && !series.includes(size) && <X className="size-3.5" aria-hidden />}
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              value={other}
              onChange={(e) => setOther(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addOther();
                }
              }}
              disabled={isPending}
              placeholder={t("stock.otherSize")}
              aria-label={t("stock.otherSize")}
              className="h-12 flex-1 text-base"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={addOther}
              disabled={isPending || !other.trim()}
              className="h-12"
            >
              <Plus className="size-4" aria-hidden />
              {t("stock.addSize")}
            </Button>
          </div>
          <FieldDescription>
            {chosen.length
              ? t("stock.seriesCount", {
                  count: chosen.length,
                  first: refs[0],
                  last: refs[refs.length - 1],
                })
              : t("stock.sizeSeriesHint")}
          </FieldDescription>
          {field === "sizes" && error && <FieldError>{t(error)}</FieldError>}
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

        <Field data-invalid={field === "quantity" || undefined} hidden={chosen.length > 0}>
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
            {t("stock.nextRefHint", { ref: refs[0] })}
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
