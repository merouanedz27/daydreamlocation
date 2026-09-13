"use client";

import { useState, useTransition } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
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
import { createMember } from "@/lib/actions/team";
import { MEMBER_ROLES } from "@/lib/validation/team";
import type { Locale } from "@/i18n/routing";

/**
 * Créer un compte d'équipe.
 *
 * L'administrateur CHOISIT le mot de passe et tend le téléphone au membre —
 * il n'y a pas de serveur d'envoi d'e-mails dans ce produit, donc pas
 * d'invitation par lien, et de toute façon l'équipe est dans la même boutique.
 */
export function MemberForm() {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [field, setField] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    setField(null);
    const name = String(formData.get("full_name") ?? "").trim();

    startTransition(async () => {
      const result = await createMember(formData);
      if (result.ok) {
        setOpen(false);
        toast.success(t("team.createdToast", { name }));
        return;
      }
      // Une erreur de CHAMP reste sous son champ : un toast ne peut pas montrer
      // quoi corriger, et il disparaît pendant qu'on retape. Le reste passe en
      // toast, tiroir ouvert — la saisie n'est pas perdue.
      if (result.field) {
        setError(result.error);
        setField(result.field);
      } else {
        toast.error(t(result.error));
      }
    });
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button className="h-11">
          <UserPlus className="size-4" aria-hidden />
          {t("team.add")}
        </Button>
      </DrawerTrigger>

      <DrawerContent className="max-h-[92svh]">
        <DrawerHeader className="text-start">
          <DrawerTitle>{t("team.add")}</DrawerTitle>
          <DrawerDescription>{t("team.addHint")}</DrawerDescription>
        </DrawerHeader>

        <form action={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <input type="hidden" name="locale" value={locale} />

          <div className="flex-1 overflow-y-auto px-4">
            <FieldGroup>
              <Field data-invalid={field === "full_name" || undefined}>
                <FieldLabel htmlFor="full_name">{t("team.fullName")}</FieldLabel>
                <Input
                  id="full_name"
                  name="full_name"
                  required
                  autoComplete="off"
                  disabled={isPending}
                  className="h-12 text-base"
                />
                {field === "full_name" && error && <FieldError>{t(error)}</FieldError>}
              </Field>

              <Field data-invalid={field === "email" || undefined}>
                <FieldLabel htmlFor="email">{t("team.email")}</FieldLabel>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  inputMode="email"
                  required
                  // Le compte du MEMBRE, pas celui de l'administrateur qui
                  // saisit : le remplissage automatique n'a rien à proposer.
                  autoComplete="off"
                  disabled={isPending}
                  className="h-12 text-base"
                />
                <FieldDescription>{t("team.emailHint")}</FieldDescription>
                {field === "email" && error && <FieldError>{t(error)}</FieldError>}
              </Field>

              <Field data-invalid={field === "password" || undefined}>
                <FieldLabel htmlFor="password">{t("team.password")}</FieldLabel>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  disabled={isPending}
                  className="h-12 text-base"
                />
                <FieldDescription>{t("team.passwordHint")}</FieldDescription>
                {field === "password" && error && <FieldError>{t(error)}</FieldError>}
              </Field>

              <Field data-invalid={field === "role" || undefined}>
                <FieldLabel htmlFor="role">{t("team.role")}</FieldLabel>
                <Select name="role" defaultValue="staff" disabled={isPending}>
                  <SelectTrigger id="role" className="h-12 w-full text-base">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MEMBER_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {t(`roles.${r}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>{t("team.roleHint")}</FieldDescription>
                {field === "role" && error && <FieldError>{t(error)}</FieldError>}
              </Field>
            </FieldGroup>
          </div>

          <DrawerFooter>
            <Button type="submit" disabled={isPending} className="h-12 w-full text-base">
              {isPending && <Spinner />}
              {t("team.create")}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
