"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile, isOwner } from "@/lib/auth";
import { shopSettingsSchema } from "@/lib/validation/settings";
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
 * Coordonnées de la boutique et conditions de location, imprimées sur le bon.
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

  revalidatePath(`/${locale}/boutique`);
  return { ok: true };
}
