"use client";

import { useState, useTransition } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, Send } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { sendTeamMessageAction, setNotificationPrefs } from "@/lib/actions/notifications";
import { cn } from "@/lib/utils";
import type { NotificationMember } from "@/lib/queries/profiles";
import type { Locale } from "@/i18n/routing";

/**
 * Deux sections : écrire à l'équipe, puis régler qui reçoit les e-mails
 * automatiques. Cases à cocher NATIVES, sur toute la ligne : 44 px au pouce,
 * et le libellé se touche comme la case.
 */
export function NotificationsPanel({
  members,
  currentId,
  configured,
}: {
  members: NotificationMember[];
  currentId: string;
  configured: boolean;
}) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [everyone, setEveryone] = useState(true);
  const [chosen, setChosen] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, startSending] = useTransition();

  const reachable = members.filter((m) => m.email);

  function send(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    startSending(async () => {
      const result = await sendTeamMessageAction({
        subject,
        body,
        recipients: everyone ? [] : chosen,
      });
      if (result.ok) {
        toast.success(t("notifications.sentToast", { count: result.sent ?? 0 }));
        setSubject("");
        setBody("");
        return;
      }
      if (result.field) setErrors({ [result.field]: result.error });
      else toast.error(t(result.error));
    });
  }

  function toggleChosen(id: string, on: boolean) {
    setChosen((list) => (on ? [...list, id] : list.filter((x) => x !== id)));
  }

  return (
    <div className="mt-5 space-y-8">
      {!configured && (
        <Alert>
          <AlertTriangle aria-hidden />
          <AlertDescription>{t("notifications.notConfigured")}</AlertDescription>
        </Alert>
      )}

      {/* --- Écrire à l'équipe ------------------------------------------- */}
      <section>
        <h2 className="text-base font-medium">{t("notifications.compose")}</h2>
        <form onSubmit={send} className="mt-3 space-y-4">
          <Field data-invalid={!!errors.subject || undefined}>
            <FieldLabel htmlFor="n-subject">{t("notifications.subject")}</FieldLabel>
            <Input
              id="n-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={150}
              aria-invalid={!!errors.subject || undefined}
              className="h-12 text-base"
            />
            {errors.subject && <FieldError>{t(errors.subject)}</FieldError>}
          </Field>

          <Field data-invalid={!!errors.body || undefined}>
            <FieldLabel htmlFor="n-body">{t("notifications.message")}</FieldLabel>
            <Textarea
              id="n-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              maxLength={5000}
              aria-invalid={!!errors.body || undefined}
              className="text-base"
            />
            {errors.body && <FieldError>{t(errors.body)}</FieldError>}
          </Field>

          <fieldset>
            <legend className="text-sm font-medium">{t("notifications.recipients")}</legend>
            <ToggleGroup
              type="single"
              variant="outline"
              value={everyone ? "all" : "some"}
              onValueChange={(v) => v && setEveryone(v === "all")}
              className="mt-2 w-full"
            >
              <ToggleGroupItem value="all" className="h-11 flex-1">
                {t("notifications.everyone", { count: reachable.length })}
              </ToggleGroupItem>
              <ToggleGroupItem value="some" className="h-11 flex-1">
                {t("notifications.choose")}
              </ToggleGroupItem>
            </ToggleGroup>

            {!everyone && (
              <ul className="border-border mt-2 divide-y rounded-lg border">
                {reachable.map((m) => (
                  <li key={m.id}>
                    <label className="flex min-h-11 items-center gap-3 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={chosen.includes(m.id)}
                        onChange={(e) => toggleChosen(m.id, e.target.checked)}
                        className="accent-primary size-5 shrink-0"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{m.full_name}</span>
                        <bdi className="text-muted-foreground block truncate text-xs">{m.email}</bdi>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>

          <Button
            type="submit"
            disabled={sending || !configured || (!everyone && chosen.length === 0)}
            className="h-12 w-full"
          >
            {sending ? <Spinner /> : <Send className="size-4 rtl:-scale-x-100" aria-hidden />}
            {t("notifications.send")}
          </Button>
        </form>
      </section>

      {/* --- E-mails automatiques ---------------------------------------- */}
      <section>
        <h2 className="text-base font-medium">{t("notifications.automatic")}</h2>
        <p className="text-muted-foreground mt-1 text-sm">{t("notifications.automaticHint")}</p>
        <ul className="mt-3 space-y-2">
          {members.map((m) => (
            <MemberPrefs
              key={m.id}
              member={m}
              self={m.id === currentId}
              locale={locale}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

/**
 * Une carte par membre. Chaque changement s'enregistre AUSSITÔT — affiché
 * d'abord, annulé si le serveur refuse : pas de bouton « Enregistrer » à
 * oublier.
 */
function MemberPrefs({
  member,
  self,
  locale,
}: {
  member: NotificationMember;
  self: boolean;
  locale: Locale;
}) {
  const t = useTranslations();
  const [prefs, setPrefs] = useState({
    notify_new_order: member.notify_new_order,
    notify_daily: member.notify_daily,
    email_locale: member.email_locale,
  });
  const [, startSaving] = useTransition();

  function save(patch: Partial<typeof prefs>) {
    const before = prefs;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    startSaving(async () => {
      const result = await setNotificationPrefs({ locale, id: member.id, ...next });
      if (!result.ok) {
        setPrefs(before);
        toast.error(t(result.error));
      }
    });
  }

  const noEmail = !member.email;

  return (
    <li className={cn("border-border bg-card rounded-lg border px-3 py-2", noEmail && "opacity-60")}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {member.full_name}
            {self && <span className="text-muted-foreground ms-1.5 text-xs">{t("team.you")}</span>}
          </p>
          <bdi className="text-muted-foreground block truncate text-xs">
            {member.email ?? t("notifications.noEmail")}
          </bdi>
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={prefs.email_locale}
          onValueChange={(v) => v && save({ email_locale: v as "fr" | "ar" })}
          aria-label={t("notifications.emailLanguage")}
          disabled={noEmail}
          className="shrink-0"
        >
          <ToggleGroupItem value="fr" className="h-9 px-3">
            {t("notifications.langFr")}
          </ToggleGroupItem>
          <ToggleGroupItem value="ar" className="h-9 px-3">
            {t("notifications.langAr")}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="mt-1">
        {(["notify_new_order", "notify_daily"] as const).map((key) => (
          <label key={key} className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              checked={prefs[key]}
              disabled={noEmail}
              onChange={(e) => save({ [key]: e.target.checked })}
              className="accent-primary size-5 shrink-0"
            />
            <span className="text-sm">
              {t(key === "notify_new_order" ? "notifications.newOrder" : "notifications.daily")}
            </span>
          </label>
        ))}
      </div>
    </li>
  );
}
