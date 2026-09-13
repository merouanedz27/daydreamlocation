"use client";

import { useState, useTransition } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { updateShopSettings } from "@/lib/actions/settings";
import type { Locale } from "@/i18n/routing";

export type ShopSettings = {
  shop_address: string | null;
  shop_phone: string | null;
  rental_terms_fr: string | null;
  rental_terms_ar: string | null;
};

/**
 * Ce que le bon de location imprime en tête et en pied.
 *
 * Champs NON CONTRÔLÉS (`defaultValue`) : rien ne dépend de leur valeur avant
 * l'envoi.
 */
export function ShopSettingsForm({ settings }: { settings: ShopSettings }) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [field, setField] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    setField(null);
    startTransition(async () => {
      const result = await updateShopSettings(formData);
      if (result.ok) {
        toast.success(t("shop.saved"));
        return;
      }
      setError(result.error);
      setField(result.field ?? null);
    });
  }

  const fieldError = (name: string) =>
    field === name && error ? <FieldError>{t(error)}</FieldError> : null;

  return (
    // `onSubmit` + `preventDefault`, et non `action=` : une action de
    // formulaire React RÉINITIALISE les champs non contrôlés après l'envoi,
    // qui repartiraient vides jusqu'au rechargement.
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(new FormData(e.currentTarget));
      }}
      noValidate
      className="mt-6"
    >
      <input type="hidden" name="locale" value={locale} />

      <FieldGroup>
        <Field data-invalid={field === "shop_address" || undefined}>
          <FieldLabel htmlFor="shop_address">{t("shop.address")}</FieldLabel>
          <Textarea
            id="shop_address"
            name="shop_address"
            rows={2}
            maxLength={300}
            defaultValue={settings.shop_address ?? ""}
            className="text-base"
          />
          {fieldError("shop_address")}
        </Field>

        <Field data-invalid={field === "shop_phone" || undefined}>
          <FieldLabel htmlFor="shop_phone">{t("shop.phone")}</FieldLabel>
          <Input
            id="shop_phone"
            name="shop_phone"
            type="tel"
            inputMode="tel"
            dir="ltr"
            maxLength={40}
            defaultValue={settings.shop_phone ?? ""}
            className="h-12 text-base"
          />
          {fieldError("shop_phone")}
        </Field>

        {/* LES DEUX LANGUES, quelle que soit celle de l'écran : le bon s'imprime
            dans la langue de la page, et un texte qui engage le client ne se
            traduit pas automatiquement. Chaque zone porte son propre `dir`,
            pour qu'on écrive l'arabe de droite à gauche même depuis l'écran
            français. */}
        <Field data-invalid={field === "rental_terms_fr" || undefined}>
          <FieldLabel htmlFor="rental_terms_fr">{t("shop.termsFr")}</FieldLabel>
          <Textarea
            id="rental_terms_fr"
            name="rental_terms_fr"
            dir="ltr"
            lang="fr"
            rows={6}
            maxLength={3000}
            defaultValue={settings.rental_terms_fr ?? ""}
            className="text-base"
          />
          <FieldDescription>{t("shop.termsHint")}</FieldDescription>
          {fieldError("rental_terms_fr")}
        </Field>

        <Field data-invalid={field === "rental_terms_ar" || undefined}>
          <FieldLabel htmlFor="rental_terms_ar">{t("shop.termsAr")}</FieldLabel>
          <Textarea
            id="rental_terms_ar"
            name="rental_terms_ar"
            dir="rtl"
            lang="ar"
            rows={6}
            maxLength={3000}
            defaultValue={settings.rental_terms_ar ?? ""}
            className="text-base"
          />
          {fieldError("rental_terms_ar")}
        </Field>
      </FieldGroup>

      {error && !field && (
        <Alert variant="destructive" className="mt-4">
          <AlertCircle />
          <AlertDescription>{t(error)}</AlertDescription>
        </Alert>
      )}

      <div className="bg-background border-border bottom-above-nav sticky z-30 mt-6 border-t py-3 md:bottom-0">
        <Button type="submit" disabled={isPending} className="h-12 w-full text-base sm:w-auto">
          {isPending && <Spinner />}
          {t("common.save")}
        </Button>
      </div>
    </form>
  );
}
