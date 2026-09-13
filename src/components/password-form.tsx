"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";
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
import { changeOwnPassword } from "@/lib/actions/auth";

type PasswordField = "current" | "password" | "confirm";

/**
 * Changer son mot de passe : l'ancien, puis le nouveau deux fois.
 *
 * `autoComplete` renseigné : le gestionnaire de mots de passe du téléphone
 * propose l'ancien et enregistre le nouveau — sur un appareil partagé au
 * comptoir, c'est souvent la seule mémoire du mot de passe.
 */
export function PasswordForm() {
  const t = useTranslations();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [field, setField] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    setField(null);
    startTransition(async () => {
      const result = await changeOwnPassword(formData);
      if (result.ok) {
        formRef.current?.reset();
        toast.success(t("account.passwordChanged"));
        return;
      }
      setError(result.error);
      setField(result.field ?? null);
    });
  }

  const input = (name: PasswordField, autoComplete: string) => (
    <Input
      id={name}
      name={name}
      type="password"
      autoComplete={autoComplete}
      required
      aria-invalid={field === name || undefined}
      disabled={isPending}
      className="h-12 text-base"
    />
  );

  return (
    <form ref={formRef} action={onSubmit} noValidate>
      <FieldGroup>
        <Field data-invalid={field === "current" || undefined}>
          <FieldLabel htmlFor="current">{t("account.currentPassword")}</FieldLabel>
          {input("current", "current-password")}
          {field === "current" && error && <FieldError>{t(error)}</FieldError>}
        </Field>

        <Field data-invalid={field === "password" || undefined}>
          <FieldLabel htmlFor="password">{t("account.newPassword")}</FieldLabel>
          {input("password", "new-password")}
          <FieldDescription>{t("account.newPasswordHint")}</FieldDescription>
          {field === "password" && error && <FieldError>{t(error)}</FieldError>}
        </Field>

        <Field data-invalid={field === "confirm" || undefined}>
          <FieldLabel htmlFor="confirm">{t("account.confirmPassword")}</FieldLabel>
          {input("confirm", "new-password")}
          {field === "confirm" && error && <FieldError>{t(error)}</FieldError>}
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
          {t("account.changePassword")}
        </Button>
      </div>
    </form>
  );
}
