"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile, isOwner } from "@/lib/auth";
import { shopSettingsSchema } from "@/lib/validation/settings";
import {
  emailTextsInputSchema,
  notificationRulesSchema,
  parseEmailTexts,
  type EmailText,
  type EmailKind,
  type NotificationRules,
} from "@/lib/notification-settings";
import { routing, type Locale } from "@/i18n/routing";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; field?: string };

function resolveLocale(value: FormDataEntryValue | null): Locale {
  return routing.locales.includes(value as Locale)
    ? (value as Locale)
    : routing.defaultLocale;
}

/**
 * Coordonnées de la boutique et conditions de location, imprimées sur le bon,
 * et message type envoyé au client par SMS.
 *
 * Le contrôle de rôle est refait ici : une Server Action est un point d'entrée
 * réseau. La policy `settings_write` refuserait de toute façon — mais un refus
 * de policy sur un `update` ne lève PAS d'erreur, il touche zéro ligne. Sans
 * ce contrôle, un employé verrait « Enregistré » sur une modification qui n'a
 * jamais eu lieu.
 */
export async function updateShopSettings(formData: FormData): Promise<ActionResult> {
  const locale = resolveLocale(formData.get("locale"));

  const profile = await getProfile();
  if (!isOwner(profile)) return { ok: false, error: "errors.forbidden" };

  const parsed = shopSettingsSchema.safeParse({
    shop_address: formData.get("shop_address"),
    shop_phone: formData.get("shop_phone"),
    rental_terms_fr: formData.get("rental_terms_fr"),
    rental_terms_ar: formData.get("rental_terms_ar"),
    customer_message: formData.get("customer_message"),
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue.message, field: String(issue.path[0] ?? "") };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("settings")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    // Ligne unique : `id` vaut toujours `true` (`settings_singleton`).
    .eq("id", true)
    .select("id");

  // Zéro ligne sans erreur = refus silencieux de la policy. On le dit.
  if (error || !data?.length) return { ok: false, error: "errors.generic" };

  // Tout le layout : le message type est lu par lui, pour toutes les listes.
  revalidatePath(`/${locale}`, "layout");
  return { ok: true };
}

/**
 * Quels événements vont dans la cloche et en push (Paramètres →
 * Notifications). L'écran envoie TOUTES les règles à chaque bascule : la
 * dernière écriture porte l'état complet, deux bascules rapides ne
 * s'écrasent pas à moitié.
 */
export async function updateNotificationRules(input: {
  locale: string;
  rules: NotificationRules;
}): Promise<ActionResult> {
  const profile = await getProfile();
  if (!isOwner(profile)) return { ok: false, error: "errors.forbidden" };

  const parsed = notificationRulesSchema.safeParse(input.rules);
  if (!parsed.success) return { ok: false, error: "errors.generic" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("settings")
    .update({ notification_rules: parsed.data, updated_at: new Date().toISOString() })
    .eq("id", true)
    .select("id");
  if (error || !data?.length) return { ok: false, error: "errors.generic" };

  revalidatePath(`/${resolveLocale(input.locale)}/parametres`);
  return { ok: true };
}

/**
 * Objet et introduction d'UN e-mail automatique, en français et en arabe.
 * Les textes de l'autre e-mail sont relus et gardés tels quels.
 */
export async function updateEmailTexts(input: {
  locale: string;
  kind: EmailKind;
  fr: EmailText;
  ar: EmailText;
}): Promise<ActionResult> {
  const profile = await getProfile();
  if (!isOwner(profile)) return { ok: false, error: "errors.forbidden" };

  const parsed = emailTextsInputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue.message, field: issue.path.join(".") };
  }
  const { kind, fr, ar } = parsed.data;

  const supabase = await createClient();
  const { data: current, error: readError } = await supabase
    .from("settings")
    .select("email_texts")
    .eq("id", true)
    .maybeSingle();
  if (readError || !current) return { ok: false, error: "errors.generic" };

  const texts = { ...parseEmailTexts(current.email_texts), [kind]: { fr, ar } };
  const { data, error } = await supabase
    .from("settings")
    .update({ email_texts: texts, updated_at: new Date().toISOString() })
    .eq("id", true)
    .select("id");
  if (error || !data?.length) return { ok: false, error: "errors.generic" };

  revalidatePath(`/${resolveLocale(input.locale)}/parametres`);
  return { ok: true };
}
