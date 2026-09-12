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
import { PhotoUpload } from "@/components/photo-upload";
import { createModel, updateModel } from "@/lib/actions/stock";
import type { ArticleModel, Category } from "@/lib/queries/stock";
import type { Locale } from "@/i18n/routing";

/**
 * Création ET modification d'un modèle — un seul formulaire.
 *
 * Deux formulaires jumeaux dériveraient l'un de l'autre au premier champ
 * ajouté : on en aurait un qui accepte ce que l'autre refuse. Ici, seuls
 * changent la valeur initiale des champs et l'action appelée.
 *
 * `pieceCount` ne sert qu'à un avertissement, mais un avertissement qui compte :
 * changer le code fournisseur ne renomme PAS les pièces déjà créées (voir
 * `updateModel`). L'employé doit le savoir avant d'enregistrer, pas après.
 */
export function ModelForm({
  categories,
  model,
  pieceCount = 0,
}: {
  categories: Category[];
  model?: ArticleModel;
  pieceCount?: number;
}) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [field, setField] = useState<string | null>(null);

  const editing = Boolean(model);

  function onSubmit(formData: FormData) {
    setError(null);
    setField(null);
    startTransition(async () => {
      const result = await (editing ? updateModel : createModel)(formData);
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
      {model && <input type="hidden" name="id" value={model.id} />}

      <FieldGroup>
        <Field>
          <FieldLabel>{t("stock.photo")}</FieldLabel>
          <PhotoUpload defaultPath={model?.photo_path ?? null} />
        </Field>

        <Field data-invalid={field === "ref_code" || undefined}>
          <FieldLabel htmlFor="ref_code">{t("stock.reference")}</FieldLabel>
          <Input
            id="ref_code"
            name="ref_code"
            required
            disabled={isPending}
            defaultValue={model?.ref_code ?? ""}
            placeholder="Gio-079"
            autoCapitalize="characters"
            autoCorrect="off"
            className="h-12 text-base"
          />
          <FieldDescription>
            {editing && pieceCount > 0
              ? t("stock.refCodeEditHint")
              : t("stock.refCodeHint")}
          </FieldDescription>
          {field === "ref_code" && error && <FieldError>{t(error)}</FieldError>}
        </Field>

        <Field data-invalid={field === "name_fr" || undefined}>
          <FieldLabel htmlFor="name_fr">{t("stock.nameFr")}</FieldLabel>
          <Input
            id="name_fr"
            name="name_fr"
            required
            disabled={isPending}
            defaultValue={model?.name_fr ?? ""}
            className="h-12 text-base"
          />
          {field === "name_fr" && error && <FieldError>{t(error)}</FieldError>}
        </Field>

        <Field>
          <FieldLabel htmlFor="name_ar">{t("stock.nameAr")}</FieldLabel>
          <Input
            id="name_ar"
            name="name_ar"
            dir="rtl"
            lang="ar"
            disabled={isPending}
            defaultValue={model?.name_ar ?? ""}
            className="h-12 text-base"
          />
          <FieldDescription>{t("stock.nameArHint")}</FieldDescription>
        </Field>

        <Field data-invalid={field === "category_id" || undefined}>
          <FieldLabel htmlFor="category_id">{t("stock.category")}</FieldLabel>
          <Select
            name="category_id"
            required
            disabled={isPending}
            defaultValue={model ? String(model.category_id) : undefined}
          >
            <SelectTrigger id="category_id" className="h-12 w-full text-base">
              <SelectValue placeholder={t("stock.category")} />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {locale === "ar" ? c.name_ar : c.name_fr}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {field === "category_id" && error && <FieldError>{t(error)}</FieldError>}
        </Field>

        <Field data-invalid={field === "base_price" || undefined}>
          <FieldLabel htmlFor="base_price">{t("stock.price")}</FieldLabel>
          <Input
            id="base_price"
            name="base_price"
            type="number"
            inputMode="numeric"
            min={0}
            step={100}
            defaultValue={model?.base_price ?? 0}
            required
            disabled={isPending}
            className="h-12 text-base"
          />
          <FieldDescription>{t("stock.priceHint")}</FieldDescription>
          {field === "base_price" && error && <FieldError>{t(error)}</FieldError>}
        </Field>

        <Field>
          <FieldLabel htmlFor="color">{t("stock.color")}</FieldLabel>
          <Input
            id="color"
            name="color"
            disabled={isPending}
            defaultValue={model?.color ?? ""}
            className="h-12 text-base"
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="brand">{t("stock.brand")}</FieldLabel>
          <Input
            id="brand"
            name="brand"
            disabled={isPending}
            defaultValue={model?.brand ?? ""}
            className="h-12 text-base"
          />
        </Field>

        {/* Encart de repli. Il n'est juste que parce que l'action ne renvoie
            QUE des champs réellement rendus ci-dessus (voir `firstIssue`) :
            un `field` sans emplacement à l'écran rendait l'erreur invisible,
            et le bouton « Enregistrer » paraissait sans effet. */}
        {error && !field && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{t(error)}</AlertDescription>
          </Alert>
        )}
      </FieldGroup>

      {/* Barre d'action collante : sur téléphone, le bouton ne doit jamais se
          perdre en bas d'un long défilement. Voir `daydream-ui`. */}
      <div className="bg-background border-border pb-safe sticky bottom-0 mt-6 border-t py-3">
        <Button type="submit" disabled={isPending} className="h-12 w-full text-base">
          {isPending && <Spinner />}
          {t("common.save")}
        </Button>
      </div>
    </form>
  );
}
