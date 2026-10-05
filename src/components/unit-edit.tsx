"use client";

import { useState, useTransition } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
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
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { deleteUnit, updateUnit } from "@/lib/actions/stock";
import { sizeSeries } from "@/lib/sizes";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/routing";

export type EditableUnit = {
  id: number;
  ref_code: string;
  size: string | null;
  length_cm: number | null;
  price_override: number | null;
};

/**
 * Corrige une pièce existante — avant tout sa TAILLE — depuis la fiche du
 * modèle. Un toucher sur le crayon ouvre le tiroir ; la référence, elle, ne
 * change jamais.
 */
export function UnitEdit({
  unit,
  categorySlug,
}: {
  unit: EditableUnit;
  categorySlug: string | null;
}) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [size, setSize] = useState(unit.size ?? "");
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const series = sizeSeries(categorySlug);

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updateUnit(formData);
      if (!result.ok) {
        setError({ message: result.error, field: result.field });
        return;
      }
      toast.success(t("stock.pieceSavedToast", { ref: unit.ref_code }));
      setOpen(false);
    });
  }

  async function onDelete() {
    const data = new FormData();
    data.set("locale", locale);
    data.set("id", String(unit.id));
    const result = await deleteUnit(data);
    if (!result.ok) return result;
    toast.success(
      t(result.retired ? "stock.pieceRetiredToast" : "stock.pieceDeletedToast", {
        ref: unit.ref_code,
      }),
    );
    setOpen(false);
    return result;
  }

  return (
    <>
      <Drawer
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            setSize(unit.size ?? "");
            setError(null);
          }
        }}
      >
        <DrawerTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-11 shrink-0"
            aria-label={t("stock.editPieceNamed", { ref: unit.ref_code })}
          >
            <Pencil className="size-4" aria-hidden />
          </Button>
        </DrawerTrigger>

        <DrawerContent className="max-h-[92svh]">
          <DrawerHeader className="text-start">
            <DrawerTitle>{t("stock.editPiece")}</DrawerTitle>
            <DrawerDescription>
              <bdi>{unit.ref_code}</bdi>
            </DrawerDescription>
          </DrawerHeader>

          <form action={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="id" value={unit.id} />

            <FieldGroup className="overflow-y-auto px-4">
              <Field data-invalid={error?.field === "size" || undefined}>
                <FieldLabel htmlFor={`unit-size-${unit.id}`}>{t("stock.size")}</FieldLabel>
                {series.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {series.map((s) => (
                      <button
                        key={s}
                        type="button"
                        aria-pressed={size === s}
                        onClick={() => setSize(size === s ? "" : s)}
                        className={cn(
                          "press tabular flex h-11 min-w-12 items-center justify-center rounded-full border px-3 text-base font-medium",
                          size === s
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background border-border hover:bg-muted",
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
                <Input
                  id={`unit-size-${unit.id}`}
                  name="size"
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  disabled={isPending}
                  placeholder="50"
                  className="h-12 text-base"
                />
                {error?.field === "size" && <FieldError>{t(error.message)}</FieldError>}
              </Field>

              <Field>
                <FieldLabel htmlFor={`unit-length-${unit.id}`}>{t("stock.length")}</FieldLabel>
                <Input
                  id={`unit-length-${unit.id}`}
                  name="length_cm"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={0.5}
                  defaultValue={unit.length_cm ?? ""}
                  disabled={isPending}
                  className="h-12 text-base"
                />
              </Field>

              <Field data-invalid={error?.field === "price_override" || undefined}>
                <FieldLabel htmlFor={`unit-price-${unit.id}`}>{t("stock.priceOverride")}</FieldLabel>
                <Input
                  id={`unit-price-${unit.id}`}
                  name="price_override"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={100}
                  defaultValue={unit.price_override ?? ""}
                  disabled={isPending}
                  className="h-12 text-base"
                />
                {error?.field === "price_override" && <FieldError>{t(error.message)}</FieldError>}
              </Field>

              {error && !error.field && (
                <p className="text-destructive text-sm" role="alert">
                  {t(error.message)}
                </p>
              )}
            </FieldGroup>

            <DrawerFooter>
              <Button type="submit" disabled={isPending} className="h-12 w-full text-base">
                {isPending && <Spinner />}
                {t("common.save")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={isPending}
                onClick={() => setConfirmDelete(true)}
                className="text-destructive hover:text-destructive h-12 w-full text-base"
              >
                <Trash2 className="size-4" aria-hidden />
                {t("stock.deletePiece")}
              </Button>
            </DrawerFooter>
          </form>
        </DrawerContent>
      </Drawer>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        icon={<Trash2 className="size-4" />}
        title={t("stock.deletePieceTitle", { ref: unit.ref_code })}
        description={t("stock.deletePieceBody")}
        confirmLabel={t("common.delete")}
        onConfirm={onDelete}
      />
    </>
  );
}
