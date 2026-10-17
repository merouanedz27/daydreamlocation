"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile, isOwner } from "@/lib/auth";
import { shiftSchema } from "@/lib/validation/pointage";
import { routing, type Locale } from "@/i18n/routing";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; field?: string };

export type ClockResult = { ok: true; at: string } | { ok: false; error: string };

function resolveLocale(value: unknown): Locale {
  return routing.locales.includes(value as Locale) ? (value as Locale) : routing.defaultLocale;
}

/**
 * Arrivée et départ de l'utilisateur connecté.
 *
 * L'heure est celle du SERVEUR Postgres (`now()` dans `clock_in()` /
 * `clock_out()`), jamais celle du téléphone : une horloge de téléphone se
 * règle à la main. L'employé n'a d'ailleurs aucun droit d'écriture direct sur
 * `work_shifts`.
 */
export async function clockIn(localeValue: string): Promise<ClockResult> {
  const locale = resolveLocale(localeValue);
  if (!(await getProfile())) return { ok: false, error: "errors.forbidden" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("clock_in");
  if (error) {
    // 23P01 : une période est déjà ouverte (double toucher, deux appareils).
    return { ok: false, error: error.code === "23P01" ? "pointage.errors.alreadyIn" : "errors.generic" };
  }

  revalidatePath(`/${locale}/pointage`);
  return { ok: true, at: data };
}

export async function clockOut(localeValue: string): Promise<ClockResult> {
  const locale = resolveLocale(localeValue);
  if (!(await getProfile())) return { ok: false, error: "errors.forbidden" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("clock_out");
  if (error) {
    return { ok: false, error: error.code === "P0002" ? "pointage.errors.notIn" : "errors.generic" };
  }

  revalidatePath(`/${locale}/pointage`);
  return { ok: true, at: data };
}

/**
 * Ajout ou correction d'une période par le propriétaire (oubli de pointage,
 * départ jamais pointé). La correction est signée : l'employé voit « corrigé »
 * sur sa ligne.
 */
export async function saveShift(formData: FormData): Promise<ActionResult> {
  const locale = resolveLocale(formData.get("locale"));

  const profile = await getProfile();
  if (!profile || !isOwner(profile)) return { ok: false, error: "errors.forbidden" };

  const parsed = shiftSchema.safeParse({
    id: formData.get("id") ?? "",
    user_id: formData.get("user_id"),
    work_date: formData.get("work_date"),
    clock_in: formData.get("clock_in") ?? "",
    clock_out: formData.get("clock_out") ?? "",
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue.message, field: String(issue.path[0] ?? "") };
  }

  const { id, ...values } = parsed.data;
  const row = { ...values, corrected_by: profile.id, corrected_at: new Date().toISOString() };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("work_shifts").update(row).eq("id", id)
    : await supabase.from("work_shifts").insert(row);

  if (error) {
    // 23P01 : chevauche une autre période de la même personne.
    if (error.code === "23P01") return { ok: false, error: "pointage.errors.overlap" };
    return { ok: false, error: "errors.generic" };
  }

  revalidatePath(`/${locale}/pointage`);
  return { ok: true };
}

/** Suppression d'une période (doublon, pointage par erreur). Propriétaire seul. */
export async function deleteShift(formData: FormData): Promise<ActionResult> {
  const locale = resolveLocale(formData.get("locale"));

  const profile = await getProfile();
  if (!isOwner(profile)) return { ok: false, error: "errors.forbidden" };

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "errors.generic" };

  const supabase = await createClient();
  const { error } = await supabase.from("work_shifts").delete().eq("id", id);
  if (error) return { ok: false, error: "errors.generic" };

  revalidatePath(`/${locale}/pointage`);
  return { ok: true };
}
