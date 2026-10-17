"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile, isOwner } from "@/lib/auth";
import { routing, type Locale } from "@/i18n/routing";

export type ActionResult = { ok: true } | { ok: false; error: string };

function resolveLocale(value: unknown): Locale {
  return routing.locales.includes(value as Locale) ? (value as Locale) : routing.defaultLocale;
}

/** P0001 = jour déjà payé (fonctions et trigger de la migration `pointage_cases`). */
function failure(code: string | undefined): ActionResult {
  return { ok: false, error: code === "P0001" ? "pointage.errors.alreadyPaid" : "errors.generic" };
}

/**
 * L'employé coche (ou décoche, après un mauvais toucher) la case du JOUR.
 *
 * La date est celle du SERVEUR, à l'heure d'Alger (`mark_today()`), jamais
 * celle du téléphone : l'employé n'a aucun droit d'écriture direct sur
 * `attendance`, et ne peut donc pas cocher hier ou demain.
 */
export async function setToday(localeValue: string, checked: boolean): Promise<ActionResult> {
  const locale = resolveLocale(localeValue);
  if (!(await getProfile())) return { ok: false, error: "errors.forbidden" };

  const supabase = await createClient();
  const { error } = await supabase.rpc(checked ? "mark_today" : "unmark_today");
  if (error) return failure(error.code);

  revalidatePath(`/${locale}/pointage`);
  return { ok: true };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Le propriétaire coche ou décoche N'IMPORTE QUEL jour non payé — un oubli,
 * une erreur. Un jour déjà payé est refusé par la base (trigger).
 */
export async function setDay(
  localeValue: string,
  userId: string,
  day: string,
  checked: boolean,
): Promise<ActionResult> {
  const locale = resolveLocale(localeValue);
  const profile = await getProfile();
  if (!profile || !isOwner(profile)) return { ok: false, error: "errors.forbidden" };
  if (!UUID.test(userId) || !DAY.test(day)) return { ok: false, error: "errors.generic" };

  const supabase = await createClient();
  const { error } = checked
    ? await supabase
        .from("attendance")
        .upsert(
          { user_id: userId, day, marked_by: profile.id },
          { onConflict: "user_id,day", ignoreDuplicates: true },
        )
    : await supabase.from("attendance").delete().eq("user_id", userId).eq("day", day);
  if (error) return failure(error.code);

  revalidatePath(`/${locale}/pointage`);
  return { ok: true };
}

/**
 * Paie d'un employé : compte ses jours depuis la dernière paie et remet son
 * compteur à zéro, en une transaction (`pay_worker()`). Rend le nombre de
 * jours payés, pour le message de confirmation.
 */
export async function payWorker(
  localeValue: string,
  userId: string,
): Promise<{ ok: true; days: number } | { ok: false; error: string }> {
  const locale = resolveLocale(localeValue);
  const profile = await getProfile();
  if (!profile || !isOwner(profile)) return { ok: false, error: "errors.forbidden" };
  if (!UUID.test(userId)) return { ok: false, error: "errors.generic" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("pay_worker", { p_user: userId });
  if (error) return { ok: false, error: "errors.generic" };

  revalidatePath(`/${locale}/pointage`);
  return { ok: true, days: data };
}
