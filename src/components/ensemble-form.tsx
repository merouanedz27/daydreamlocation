"use client";

import { useState, useTransition } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertCircle, Plus, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { OrderPiecePicker, type PickedUnit } from "@/components/order-piece-picker";
import { saveEnsemble } from "@/lib/actions/ensembles";
import { formatMoney } from "@/lib/format";
import type { EnsembleDetail } from "@/lib/queries/ensembles";
import type { PickerModel, Unavailability } from "@/lib/queries/orders";
import type { Locale } from "@/i18n/routing";

type Piece = {
  unitId: number;
  refCode: string;
  modelName: string;
  size: string | null;
  price: number;
  retired: boolean;
};

/** Aucune date ici : un ensemble ne se réserve jamais, rien n'est « indisponible ». */
const NO_UNAVAILABILITY = new Map<number, Unavailability>();

/**
 * Création ET modification d'un ensemble — « Costume n°12 ».
 *
 * Les pièces se choisissent avec le MÊME tiroir que la saisie de commande :
 * recherche, catégories et références se lisent de la même façon partout.
 *
 * La somme des pièces s'affiche à côté du forfait : c'est ce qui permet au
 * patron de fixer un forfait qui soit vraiment une remise.
 */
export function EnsembleForm({
  models,
  ensemble,
}: {
  models: PickerModel[];
  ensemble?: EnsembleDetail;
}) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [field, setField] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pieces, setPieces] = useState<Piece[]>(
    () =>
      ensemble?.pieces.map((p) => ({
        unitId: p.unit_id,
        refCode: p.ref_code,
        modelName: locale === "ar" && p.model_name_ar ? p.model_name_ar : p.model_name_fr,
        size: p.size,
        price: p.price,
        retired: p.status === "retire",
      })) ?? [],
  );

  const total = pieces.reduce((sum, p) => sum + p.price, 0);

  function addPiece(unit: PickedUnit) {
    setPieces((prev) =>
      prev.some((p) => p.unitId === unit.unitId)
        ? prev
        : [
            ...prev,
            {
              unitId: unit.unitId,
              refCode: unit.refCode,
              modelName: unit.modelName,
              size: unit.size,
              price: unit.unitPrice,
              retired: false,
            },
          ],
    );
    if (field === "unit_ids") {
      setError(null);
      setField(null);
    }
    setPickerOpen(false);
  }

  function onSubmit(formData: FormData) {
    setError(null);
    setField(null);
    startTransition(async () => {
      const result = await saveEnsemble(formData);
      // Succès = redirection : on n'arrive ici que sur erreur.
      if (result && !result.ok) {
        setError(result.error);
        setField(result.field ?? null);
      }
    });
  }

  return (
    <form action={onSubmit} noValidate>
      <input type="hidden" name="locale" value={locale} />
      {ensemble && <input type="hidden" name="id" value={ensemble.id} />}
      {pieces.map((p) => (
        <input key={p.unitId} type="hidden" name="unit_id" value={p.unitId} />
      ))}

      <FieldGroup>
        <Field data-invalid={field === "name" || undefined}>
          <FieldLabel htmlFor="name">{t("stock.ensembleName")}</FieldLabel>
          <Input
            id="name"
            name="name"
            required
            aria-invalid={field === "name" || undefined}
            disabled={isPending}
            defaultValue={ensemble?.name ?? ""}
            placeholder={t("stock.ensembleNamePlaceholder")}
            className="h-12 text-base"
          />
          {field === "name" && error && <FieldError>{t(error)}</FieldError>}
        </Field>

        {/* --- Pièces --------------------------------------------------------- */}
        <Field data-invalid={field === "unit_ids" || undefined}>
          <FieldLabel>{t("stock.ensemblePiecesLabel")}</FieldLabel>
          <FieldDescription>{t("stock.ensemblePiecesHint")}</FieldDescription>

          {pieces.length === 0 ? (
            <p className="border-border text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center text-sm">
              {t("stock.noPiecesYet")}
            </p>
          ) : (
            <ul className="border-border divide-border divide-y rounded-lg border">
              {pieces.map((p) => (
                <li key={p.unitId} className="flex min-h-14 items-center gap-3 py-2 ps-3 pe-1">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      <bdi>{p.refCode}</bdi>
                      {p.size && (
                        <span className="text-muted-foreground font-normal">
                          {" · "}
                          {t("stock.size")} {p.size}
                        </span>
                      )}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">{p.modelName}</p>
                    {p.retired && (
                      <Badge className="bg-warning-soft text-warning mt-1 border-transparent">
                        {t("stock.pieceRetiredInEnsemble")}
                      </Badge>
                    )}
                  </div>
                  <span className="tabular shrink-0 text-sm">{formatMoney(p.price, locale)}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={isPending}
                    className="size-11 shrink-0"
                    onClick={() => setPieces((prev) => prev.filter((x) => x.unitId !== p.unitId))}
                  >
                    <X className="size-4" aria-hidden />
                    <span className="sr-only">{t("stock.removePiece", { ref: p.refCode })}</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => setPickerOpen(true)}
            className="h-11 w-full"
          >
            <Plus className="size-4" aria-hidden />
            {t("stock.addPiece")}
          </Button>

          {pieces.length > 0 && (
            <p className="text-muted-foreground text-sm">
              {t("stock.piecesTotal", { amount: formatMoney(total, locale) })}
            </p>
          )}
          {field === "unit_ids" && error && <FieldError>{t(error)}</FieldError>}
        </Field>

        <Field data-invalid={field === "package_price" || undefined}>
          <FieldLabel htmlFor="package_price">{t("stock.packagePrice")}</FieldLabel>
          <Input
            id="package_price"
            name="package_price"
            type="number"
            inputMode="numeric"
            min={0}
            step={100}
            aria-invalid={field === "package_price" || undefined}
            disabled={isPending}
            defaultValue={ensemble?.package_price ?? ""}
            className="h-12 text-base"
          />
          <FieldDescription>{t("stock.packagePriceHint")}</FieldDescription>
          {field === "package_price" && error && <FieldError>{t(error)}</FieldError>}
        </Field>

        <Field data-invalid={field === "description" || undefined}>
          <FieldLabel htmlFor="description">{t("stock.ensembleDescription")}</FieldLabel>
          <Textarea
            id="description"
            name="description"
            rows={2}
            disabled={isPending}
            defaultValue={ensemble?.description ?? ""}
            className="text-base"
          />
          {field === "description" && error && <FieldError>{t(error)}</FieldError>}
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
          {t("common.save")}
        </Button>
      </div>

      <OrderPiecePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        models={models}
        unavailable={NO_UNAVAILABILITY}
        alreadyPicked={new Set(pieces.map((p) => p.unitId))}
        onPick={addPiece}
      />
    </form>
  );
}
