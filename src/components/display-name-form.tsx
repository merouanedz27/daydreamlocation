"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { changeOwnName } from "@/lib/actions/auth";

/** Changer son nom affiché — celui de l'en-tête et de la liste d'équipe. */
export function DisplayNameForm({ initialName }: { initialName: string }) {
  const t = useTranslations();
  const [name, setName] = useState(initialName);
  const [saved, setSaved] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const unchanged = name.trim() === saved.trim();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await changeOwnName(formData);
      if (result.ok) {
        setSaved(name.trim());
        setName(name.trim());
        toast.success(t("account.nameChanged"));
        return;
      }
      setError(result.error);
    });
  }

  return (
    <form action={onSubmit} noValidate>
      <Field data-invalid={!!error || undefined}>
        <FieldLabel htmlFor="full_name">{t("account.displayName")}</FieldLabel>
        <div className="flex gap-2">
          <Input
            id="full_name"
            name="full_name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            maxLength={80}
            required
            aria-invalid={!!error || undefined}
            disabled={isPending}
            className="h-12 min-w-0 flex-1 text-base"
          />
          <Button type="submit" disabled={isPending || unchanged} className="h-12 shrink-0 px-4">
            {isPending && <Spinner />}
            {t("account.saveName")}
          </Button>
        </div>
        <FieldDescription>{t("account.displayNameHint")}</FieldDescription>
        {error && <FieldError>{t(error)}</FieldError>}
      </Field>
    </form>
  );
}
