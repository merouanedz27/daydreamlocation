"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertCircle, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { signIn } from "@/lib/actions/auth";
import type { Locale } from "@/i18n/routing";

export function SignInForm() {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<"email" | "password" | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  /* Champs CONTRÔLÉS, et ce n'est pas du zèle : React 19 vide un formulaire
     non contrôlé après chaque `action`. Un mot de passe mal tapé effaçait donc
     aussi l'e-mail — à ressaisir en entier sur un clavier de téléphone. */
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  /* Incrémenté à chaque échec : relance le focus même quand la MÊME erreur
     revient deux fois de suite. */
  const [attempt, setAttempt] = useState(0);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Après un échec, le curseur revient là où il faut corriger. Dans un
  // effet : pendant l'envoi les champs sont `disabled`, et un champ désactivé
  // refuse le focus.
  useEffect(() => {
    if (attempt === 0) return;
    const target = fieldError === "email" ? emailRef.current : passwordRef.current;
    target?.focus();
    target?.select();
  }, [attempt, fieldError]);

  function onSubmit(formData: FormData) {
    setError(null);
    setFieldError(null);

    startTransition(async () => {
      const result = await signIn(formData);
      // En cas de succès l'action redirige : on n'arrive ici que sur erreur.
      if (result && !result.ok) {
        setError(result.error);
        setFieldError(result.field ?? null);
        setAttempt((n) => n + 1);
      }
    });
  }

  return (
    <form action={onSubmit} noValidate>
      <input type="hidden" name="locale" value={locale} />

      <FieldGroup>
        <Field data-invalid={fieldError === "email" || undefined}>
          <FieldLabel htmlFor="email">{t("auth.email")}</FieldLabel>
          <InputGroup className="h-12">
            <InputGroupInput
              ref={emailRef}
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              /* Une adresse e-mail s'écrit de gauche à droite, même dans
                 l'interface arabe : sans `dir`, le « @ » et le domaine se
                 réordonnent à l'écran pendant la frappe. */
              dir="ltr"
              placeholder={t("auth.emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              aria-invalid={fieldError === "email" || undefined}
              disabled={isPending}
              className="h-full text-base"
            />
            <InputGroupAddon>
              <Mail aria-hidden />
            </InputGroupAddon>
          </InputGroup>
          {fieldError === "email" && error && <FieldError>{t(error)}</FieldError>}
        </Field>

        <Field data-invalid={fieldError === "password" || undefined}>
          <FieldLabel htmlFor="password">{t("auth.password")}</FieldLabel>
          <InputGroup className="h-12">
            <InputGroupInput
              ref={passwordRef}
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              dir="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              aria-invalid={fieldError === "password" || undefined}
              disabled={isPending}
              className="h-full text-base"
            />
            <InputGroupAddon>
              <LockKeyhole aria-hidden />
            </InputGroupAddon>
            <InputGroupAddon align="inline-end">
              {/* Sur téléphone, on tape à l'aveugle sur un petit clavier :
                  pouvoir relire le mot de passe évite la moitié des échecs.
                  Cible de 44 px, comme partout. */}
              <InputGroupButton
                size="icon-sm"
                className="size-11"
                aria-label={t(showPassword ? "auth.hidePassword" : "auth.showPassword")}
                title={t(showPassword ? "auth.hidePassword" : "auth.showPassword")}
                aria-pressed={showPassword}
                aria-controls="password"
                onClick={() => setShowPassword((v) => !v)}
                disabled={isPending}
              >
                {showPassword ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          {fieldError === "password" && error && <FieldError>{t(error)}</FieldError>}
        </Field>

        {error && !fieldError && (
          <Alert variant="destructive" aria-live="polite">
            <AlertCircle />
            <AlertDescription>{t(error)}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" disabled={isPending} className="h-12 w-full text-base">
          {isPending && <Spinner data-icon="inline-start" />}
          {t(isPending ? "auth.signingIn" : "auth.signIn")}
        </Button>
      </FieldGroup>
    </form>
  );
}
