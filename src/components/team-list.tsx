"use client";

import { useRef, useState, useTransition } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  KeyRound,
  MoreVertical,
  ShieldCheck,
  ShieldOff,
  UserCheck,
  UserX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  resetMemberPassword,
  setMemberActive,
  setMemberRole,
} from "@/lib/actions/team";
import { cn } from "@/lib/utils";
import { Highlight } from "@/components/highlight";
import { MEMBER_ROLES, type MemberRole } from "@/lib/validation/team";
import type { Member } from "@/lib/queries/profiles";
import type { Locale } from "@/i18n/routing";

type Pending =
  | { kind: "role"; member: Member; role: MemberRole }
  | { kind: "active" | "password"; member: Member }
  | null;

/**
 * L'équipe, une carte compacte par personne — deux lignes : qui, et avec quel
 * identifiant.
 *
 * Jamais un `<table>` : à 390 px il déborderait, et c'est une liste de quatre
 * ou cinq lignes lue au pouce.
 *
 * AUCUNE SUPPRESSION, et ce n'est pas un oubli. `orders.created_by` et
 * `expenses.created_by` pointent sur `profiles` sans clause `on delete` :
 * supprimer un compte heurterait ces clés étrangères. Surtout, l'historique
 * doit continuer de dire qui a saisi quoi. Un départ se DÉSACTIVE.
 *
 * Les retours passent par des toasts : succès, et erreurs sans champ à
 * corriger. Une erreur de CHAMP reste sous le champ.
 */
export function TeamList({
  members,
  currentId,
}: {
  members: Member[];
  currentId: string;
}) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const [pending, setPending] = useState<Pending>(null);

  /**
   * Chaque élément du menu ouvre un tiroir. En se fermant, le menu rendrait le
   * focus à son bouton ⋮ — et l'arracherait au tiroir qui vient de s'ouvrir.
   * Même motif que le menu compte de `app-header.tsx`.
   */
  const openingDrawer = useRef(false);

  function open(kind: "active" | "password", member: Member) {
    openingDrawer.current = true;
    setPending({ kind, member });
  }

  function openRole(member: Member, role: MemberRole) {
    openingDrawer.current = true;
    setPending({ kind: "role", member, role });
  }

  if (members.length === 0) {
    return <p className="text-muted-foreground mt-6 text-sm">{t("team.empty")}</p>;
  }

  const target = pending?.member;
  const nextRole = pending?.kind === "role" ? pending.role : null;

  function payload(member: Member, extra: Record<string, string>) {
    const data = new FormData();
    data.set("locale", locale);
    data.set("id", member.id);
    for (const [k, v] of Object.entries(extra)) data.set(k, v);
    return data;
  }

  return (
    <>
      <ul className="mt-4 space-y-1.5">
        {members.map((member) => {
          const self = member.id === currentId;
          const admin = member.role === "owner";

          return (
            <li
              key={member.id}
              className={cn(
                "border-border flex items-center gap-2 rounded-lg border py-1.5 ps-3 pe-1",
                member.is_active ? "bg-card" : "bg-muted/40",
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="min-w-0 truncate text-sm font-medium">
                    <Highlight text={member.full_name} />
                  </span>
                  {self && (
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {t("team.you")}
                    </span>
                  )}
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-1.5 text-[11px] leading-5",
                      admin
                        ? "bg-gold-soft text-foreground"
                        : member.role === "moderator"
                          ? "bg-success-soft text-success-foreground"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {t(`roles.${member.role}`)}
                  </span>
                  {/* Jamais la couleur seule : le mot porte l'information. */}
                  {!member.is_active && (
                    <span className="bg-muted text-muted-foreground shrink-0 rounded-full px-1.5 text-[11px] leading-5">
                      {t("team.inactive")}
                    </span>
                  )}
                </div>

                {/* Une adresse latine au milieu d'une phrase arabe se
                    réordonne à l'affichage : `<bdi>` l'isole. */}
                <p className="text-muted-foreground truncate text-xs">
                  <bdi>{member.email ? <Highlight text={member.email} /> : "—"}</bdi>
                </p>
              </div>

              {/* La carte rétrécit, pas la cible : le bouton garde ses 44 px. */}
              {self ? (
                <span className="size-11 shrink-0" aria-hidden />
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-11 shrink-0">
                      <MoreVertical className="size-5" aria-hidden />
                      <span className="sr-only">
                        {t("team.actionsFor", { name: member.full_name })}
                      </span>
                    </Button>
                  </DropdownMenuTrigger>

                  {/* `w-auto` : le menu shadcn prend par défaut la largeur de son
                      déclencheur — ici une icône de 44 px, qui tronquait tous
                      les libellés. */}
                  <DropdownMenuContent
                    align="end"
                    className="w-auto min-w-56"
                    onCloseAutoFocus={(e) => {
                      if (!openingDrawer.current) return;
                      openingDrawer.current = false;
                      e.preventDefault();
                    }}
                  >
                    {/* Un élément par AUTRE rôle : administrateur, modérateur, membre. */}
                    {MEMBER_ROLES.filter((role) => role !== member.role).map((role) => (
                      <DropdownMenuItem
                        key={role}
                        className="min-h-11"
                        onSelect={() => openRole(member, role)}
                      >
                        {role === "staff" ? (
                          <ShieldOff className="size-4" aria-hidden />
                        ) : (
                          <ShieldCheck className="size-4" aria-hidden />
                        )}
                        {t(`team.roleTo.${role}`)}
                      </DropdownMenuItem>
                    ))}

                    <DropdownMenuItem
                      className="min-h-11"
                      onSelect={() => open("password", member)}
                    >
                      <KeyRound className="size-4" aria-hidden />
                      {t("team.resetPassword")}
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    <DropdownMenuItem
                      className="min-h-11"
                      variant={member.is_active ? "destructive" : "default"}
                      onSelect={() => open("active", member)}
                    >
                      {member.is_active ? (
                        <UserX className="size-4" aria-hidden />
                      ) : (
                        <UserCheck className="size-4" aria-hidden />
                      )}
                      {member.is_active ? t("team.deactivate") : t("team.activate")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </li>
          );
        })}
      </ul>

      {/* Changement de rôle — `default` et non `danger` : le geste se refait.
          Le tiroir se ferme même sur erreur : il n'y a rien à ressaisir, et le
          toast dit pourquoi. */}
      <ConfirmDialog
        open={pending?.kind === "role"}
        onOpenChange={(next) => !next && setPending(null)}
        tone="default"
        icon={<ShieldCheck className="size-4" />}
        title={
          target && nextRole ? t(`team.roleToTitle.${nextRole}`, { name: target.full_name }) : ""
        }
        description={nextRole ? t(`team.roleToBody.${nextRole}`) : undefined}
        confirmLabel={nextRole ? t(`team.roleTo.${nextRole}`) : ""}
        onConfirm={async () => {
          if (!target || !nextRole) return;
          const result = await setMemberRole(payload(target, { role: nextRole }));
          if (result.ok) {
            toast.success(t("team.roleChangedToast", { name: target.full_name }));
          } else {
            toast.error(t(result.error));
          }
        }}
      />

      <ConfirmDialog
        open={pending?.kind === "active"}
        onOpenChange={(next) => !next && setPending(null)}
        tone={target?.is_active ? "danger" : "default"}
        icon={target?.is_active ? <UserX className="size-4" /> : <UserCheck className="size-4" />}
        title={
          target
            ? t(target.is_active ? "team.deactivateTitle" : "team.activateTitle", {
                name: target.full_name,
              })
            : ""
        }
        description={
          target
            ? t(target.is_active ? "team.deactivateBody" : "team.activateBody")
            : undefined
        }
        confirmLabel={target?.is_active ? t("team.deactivate") : t("team.activate")}
        onConfirm={async () => {
          if (!target) return;
          const result = await setMemberActive(
            payload(target, { active: target.is_active ? "0" : "1" }),
          );
          if (result.ok) {
            toast.success(
              t(target.is_active ? "team.deactivatedToast" : "team.activatedToast", {
                name: target.full_name,
              }),
            );
          } else {
            toast.error(t(result.error));
          }
        }}
      />

      {target && (
        <PasswordDrawer
          open={pending?.kind === "password"}
          onOpenChange={(next) => !next && setPending(null)}
          member={target}
        />
      )}
    </>
  );
}

/**
 * Redonner un mot de passe.
 *
 * Un tiroir à part et non un `ConfirmDialog` : il faut un champ. Sans serveur
 * d'e-mails, c'est la SEULE voie de récupération du produit — un membre qui
 * oublie son mot de passe serait sinon enfermé dehors définitivement.
 */
function PasswordDrawer({
  open,
  onOpenChange,
  member,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: Member;
}) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const [isPending, startTransition] = useTransition();
  const [fieldError, setFieldError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setFieldError(null);
    formData.set("locale", locale);
    formData.set("id", member.id);
    startTransition(async () => {
      const result = await resetMemberPassword(formData);
      if (result.ok) {
        onOpenChange(false);
        toast.success(t("team.passwordChangedToast", { name: member.full_name }));
        return;
      }
      // Un mot de passe refusé se corrige sous le champ ; le reste n'a pas de
      // champ à montrer. Le tiroir reste ouvert dans les deux cas.
      if (result.field) setFieldError(result.error);
      else toast.error(t(result.error));
    });
  }

  return (
    <Drawer
      open={open}
      dismissible={!isPending}
      onOpenChange={(next) => {
        if (isPending && !next) return;
        if (!next) setFieldError(null);
        onOpenChange(next);
      }}
    >
      <DrawerContent className="max-h-[92svh]">
        <DrawerHeader className="text-start">
          <DrawerTitle>{t("team.resetPassword")}</DrawerTitle>
          <DrawerDescription>
            {t("team.resetPasswordBody", { name: member.full_name })}
          </DrawerDescription>
        </DrawerHeader>

        <form action={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-4">
            <Field data-invalid={fieldError ? true : undefined}>
              <FieldLabel htmlFor="new-password">{t("team.newPassword")}</FieldLabel>
              <Input
                id="new-password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                disabled={isPending}
                className="h-12 text-base"
              />
              <FieldDescription>{t("team.passwordHint")}</FieldDescription>
              {fieldError && <FieldError>{t(fieldError)}</FieldError>}
            </Field>
          </div>

          <DrawerFooter>
            <Button type="submit" disabled={isPending} className="h-12 w-full text-base">
              {isPending && <Spinner />}
              {t("common.save")}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
