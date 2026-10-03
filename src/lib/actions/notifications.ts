"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile, isOwner } from "@/lib/auth";
import { emailConfigured } from "@/lib/email/send";
import { getRecipients, sendTeamMessage } from "@/lib/email/notify";
import { notificationPrefsSchema, teamMessageSchema } from "@/lib/validation/notifications";
import { routing, type Locale } from "@/i18n/routing";

export type NotifyResult =
  { ok: true; sent?: number } | { ok: false; error: string; field?: string };

function resolveLocale(value: unknown): Locale {
  return routing.locales.includes(value as Locale) ? (value as Locale) : routing.defaultLocale;
}

/**
 * Le message de l'administrateur, par e-mail, à tous les administrateurs ou à quelques-uns
 * d'entre eux. Le rôle est revérifié ICI : une Server Action est un point
 * d'entrée réseau à part entière, la page `requireOwner` ne suffit pas.
 */
export async function sendTeamMessageAction(input: {
  subject: string;
  body: string;
  recipients: string[];
}): Promise<NotifyResult> {
  const profile = await getProfile();
  if (!isOwner(profile)) return { ok: false, error: "errors.forbidden" };

  const parsed = teamMessageSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue.message, field: String(issue.path[0] ?? "") };
  }
  if (!emailConfigured()) return { ok: false, error: "errors.emailNotConfigured" };

  const { subject, body, recipients: chosen } = parsed.data;
  const everyone = await getRecipients();
  // Une liste choisie ne peut viser que des membres ACTIFS avec une adresse :
  // le filtre se fait sur la liste lue en base, pas sur ce que le client envoie.
  const recipients = chosen.length ? everyone.filter((r) => chosen.includes(r.id)) : everyone;
  if (recipients.length === 0) return { ok: false, error: "errors.noRecipients" };

  const sent = await sendTeamMessage(recipients, {
    subject,
    body,
    senderName: profile!.full_name,
  });
  if (sent === 0) return { ok: false, error: "errors.emailFailed" };
  return { ok: true, sent };
}

/**
 * Qui reçoit quels e-mails automatiques, et en quelle langue. Écrit à travers
 * RLS (`profiles_update_owner`) — pas besoin de la clé secrète.
 */
export async function setNotificationPrefs(input: {
  locale: string;
  id: string;
  notify_new_order: boolean;
  notify_daily: boolean;
  email_locale: string;
}): Promise<NotifyResult> {
  const profile = await getProfile();
  if (!isOwner(profile)) return { ok: false, error: "errors.forbidden" };

  const parsed = notificationPrefsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "errors.generic" };
  const { id, ...prefs } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update(prefs)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "errors.generic" };

  revalidatePath(`/${resolveLocale(input.locale)}/equipe/notifications`);
  return { ok: true };
}
