"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getRecentNotifications,
  getUnreadNotificationCount,
  type NotificationRow,
} from "@/lib/queries/notifications";
import { getProfile, isOwner } from "@/lib/auth";
import { emailConfigured } from "@/lib/email/send";
import { getRecipients, sendTeamMessage } from "@/lib/email/notify";
import {
  notificationPrefsSchema,
  pushSubscriptionSchema,
  teamMessageSchema,
} from "@/lib/validation/notifications";
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

  revalidatePath(`/${resolveLocale(input.locale)}/parametres`);
  return { ok: true };
}

/**
 * Les 30 dernières notifications de la personne connectée, lues à travers RLS
 * à l'ouverture de la cloche : rien n'alourdit le layout de chaque page.
 */
export async function listNotifications(): Promise<NotificationRow[]> {
  const profile = await getProfile();
  if (!profile) return [];
  return getRecentNotifications();
}

/** Le badge, relu quand le temps réel signale un changement. */
export async function countUnreadNotifications(): Promise<number> {
  const profile = await getProfile();
  if (!profile) return 0;
  return getUnreadNotificationCount();
}

/*
 * Lu / tout lu / suppression : pas de `revalidatePath`. La cloche met son
 * état à jour d'elle-même (optimiste, puis temps réel) ; revalider le layout
 * relançait le rendu de toute l'application à chaque toucher.
 */
export async function markNotificationRead(input: { id: number }): Promise<NotifyResult> {
  const profile = await getProfile();
  if (!profile) return { ok: false, error: "errors.forbidden" };
  if (!Number.isInteger(input.id) || input.id <= 0) {
    return { ok: false, error: "errors.generic" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", input.id)
    .eq("recipient_id", profile.id)
    .select("id")
    .maybeSingle();

  return error || !data ? { ok: false, error: "errors.generic" } : { ok: true };
}

export async function markAllNotificationsRead(): Promise<NotifyResult> {
  const profile = await getProfile();
  if (!profile) return { ok: false, error: "errors.forbidden" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", profile.id)
    .is("read_at", null);

  return error ? { ok: false, error: "errors.generic" } : { ok: true };
}

export async function deleteNotifications(input: { ids: number[] }): Promise<NotifyResult> {
  const profile = await getProfile();
  if (!profile) return { ok: false, error: "errors.forbidden" };

  const ids = [...new Set(input.ids)].filter((id) => Number.isInteger(id) && id > 0);
  if (ids.length === 0 || ids.length > 100) {
    return { ok: false, error: "errors.generic" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .delete()
    .in("id", ids)
    .eq("recipient_id", profile.id);

  return error ? { ok: false, error: "errors.generic" } : { ok: true };
}

/**
 * Enregistre (ou rafraîchit) l'abonnement push de CET appareil pour la
 * personne connectée. Appelé à l'activation et à chaque ouverture de l'app :
 * la langue et `last_seen_at` restent à jour.
 *
 * Téléphone partagé : si l'adresse appartient encore à un autre membre, elle
 * passe à la personne connectée. Le navigateur détient l'abonnement (adresse
 * + clés) : c'est la preuve qu'il s'agit bien de cet appareil. Le client
 * admin est nécessaire ici, RLS interdisant de toucher la ligne d'un autre.
 */
export async function savePushSubscription(input: {
  locale: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent?: string;
}): Promise<NotifyResult> {
  const profile = await getProfile();
  if (!profile) return { ok: false, error: "errors.forbidden" };

  const parsed = pushSubscriptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "errors.generic" };

  const admin = createAdminClient();
  const { error } = await admin.from("push_subscriptions").upsert(
    {
      user_id: profile.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.p256dh,
      auth: parsed.data.auth,
      locale: parsed.data.locale,
      user_agent: parsed.data.user_agent ?? null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );

  return error ? { ok: false, error: "errors.generic" } : { ok: true };
}

export async function removePushSubscription(input: {
  endpoint: string;
}): Promise<NotifyResult> {
  const profile = await getProfile();
  if (!profile) return { ok: false, error: "errors.forbidden" };
  if (typeof input.endpoint !== "string" || input.endpoint.length > 2048) {
    return { ok: false, error: "errors.generic" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", input.endpoint)
    .eq("user_id", profile.id);

  return error ? { ok: false, error: "errors.generic" } : { ok: true };
}
