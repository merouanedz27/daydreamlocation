"use client";

import { useState, useTransition } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { signIn } from "@/lib/actions/auth";
import type { Locale } from "@/i18n/routing";

export function SignInForm() {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<"email" | "password" | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    setFieldError(null);

    startTransition(async () => {
      const result = await signIn(formData);
      // En cas de succès l'action redirige : on n'arrive ici que sur erreur.
      if (result && !result.ok) {
        setError(result.error);
        setFieldError(result.field ?? null);
      }
    });
  }

  return (
    <form action={onSubmit} noValidate>
      <input type="hidden" name="locale" value={locale} />

      <FieldGroup>
        <Field data-invalid={fieldError === "email" || undefined}>
          <FieldLabel htmlFor="email">{t("auth.email")}</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            required
            disabled={isPending}
            className="h-12 text-base"
          />
          {fieldError === "email" && error && (
            <FieldError>{t(error)}</FieldError>
          )}
        </Field>

        <Field data-invalid={fieldError === "password" || undefined}>
          <FieldLabel htmlFor="password">{t("auth.password")}</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            disabled={isPending}
            className="h-12 text-base"
          />
          {fieldError === "password" && error && (
            <FieldError>{t(error)}</FieldError>
          )}
        </Field>

        {error && !fieldError && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{t(error)}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" disabled={isPending} className="h-12 w-full text-base">
          {isPending && <Spinner />}
          {t("auth.signIn")}
        </Button>
      </FieldGroup>
    </form>
  );
}
