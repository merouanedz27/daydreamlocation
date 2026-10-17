"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getProfile, isOwner } from "@/lib/auth";
import { isShift } from "@/lib/pointage";
import { routing, type Locale } from "@/i18n/routing";

export type ActionResult = { ok: true } | { ok: false; error: string };

function resolveLocale(value: unknown): Locale {
  return routing.locales.includes(value as Locale) ? (value as Locale) : routing.defaultLocale;
}

/**
 * Codes levés par les fonctions et le trigger du pointage :
 * P0001 = jour déjà payé, P0003 = jour futur ou hors de la période ouverte.
 */
function failure(code: string | undefined): ActionResult {
  const key =
    code === "P0001"
      ? "pointage.errors.alreadyPaid"
      : code === "P0003"
        ? "pointage.errors.outOfPeriod"
        : "errors.generic";
  return { ok: false, error: key };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * L'employé coche un service (matin / après-midi) d'un jour de SA période —
 * aujourd'hui, ou un jour oublié. Décocher n'est permis que pour aujourd'hui
 * (mauvais toucher) : une case passée ne s'efface que par le propriétaire.
 *
 * Les bornes sont tenues par la base (`mark_day()`, à la date d'Alger du
 * serveur) : jamais le futur, jamais un jour payé, jamais avant la période.
 * L'employé n'a aucun droit d'écriture direct sur `attendance`.
 */
export async function setMyDay(
  localeValue: string,
  day: string,
  shift: string,
  checked: boolean,
): Promise<ActionResult> {
  const locale = resolveLocale(localeValue);
  if (!(await getProfile())) return { ok: false, error: "errors.forbidden" };
  if (!DAY.test(day) || !isShift(shift)) return { ok: false, error: "errors.generic" };

  const supabase = await createClient();
  const { error } = checked
    ? await supabase.rpc("mark_day", { p_day: day, p_shift: shift })
    : await supabase.rpc("unmark_today", { p_shift: shift });
  if (error) return failure(error.code);

  revalidatePath(`/${locale}/pointage`);
  return { ok: true };
}

/**
 * Le propriétaire coche ou décoche N'IMPORTE QUELLE case d'un jour non payé
 * — un oubli, une erreur. Un jour déjà payé est refusé par la base (trigger).
 */
export async function setDay(
  localeValue: string,
  userId: string,
  day: string,
  shift: string,
  checked: boolean,
): Promise<ActionResult> {
  const locale = resolveLocale(localeValue);
  const profile = await getProfile();
  if (!profile || !isOwner(profile)) return { ok: false, error: "errors.forbidden" };
  if (!UUID.test(userId) || !DAY.test(day) || !isShift(shift)) {
    return { ok: false, error: "errors.generic" };
  }

  const supabase = await createClient();
  const { error } = checked
    ? await supabase
        .from("attendance")
        .upsert(
          { user_id: userId, day, shift, marked_by: profile.id },
          { onConflict: "user_id,day,shift", ignoreDuplicates: true },
        )
    : await supabase
        .from("attendance")
        .delete()
        .eq("user_id", userId)
        .eq("day", day)
        .eq("shift", shift);
  if (error) return failure(error.code);

  revalidatePath(`/${locale}/pointage`);
  return { ok: true };
}

/**
 * Paie d'un employé : jours cochés depuis la dernière paie (un service = un
 * jour) × prix d'une journée. En UNE transaction (`pay_worker()`), la base
 * compte, ajoute la dépense « Salaire » aux frais et remet le compteur à
 * zéro. Rend les jours et le total réellement payés, pour le message.
 *
 * Le libellé de la dépense s'écrit dans la langue du propriétaire : c'est lui
 * qui relit ses frais.
 */
export async function payWorker(
  localeValue: string,
  userId: string,
  dailyRate: number,
): Promise<{ ok: true; days: number; amount: number } | { ok: false; error: string }> {
  const locale = resolveLocale(localeValue);
  const profile = await getProfile();
  if (!profile || !isOwner(profile)) return { ok: false, error: "errors.forbidden" };
  if (!UUID.test(userId)) return { ok: false, error: "errors.generic" };
  if (!Number.isFinite(dailyRate) || dailyRate <= 0 || dailyRate > 10_000_000) {
    return { ok: false, error: "pointage.errors.rateRequired" };
  }

  const supabase = await createClient();
  const { data: worker } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();
  const t = await getTranslations({ locale, namespace: "pointage" });
  const description = t("expenseLabel", { name: worker?.full_name ?? "" });

  const { data, error } = await supabase.rpc("pay_worker", {
    p_user: userId,
    p_daily_rate: Math.round(dailyRate),
    p_description: description,
  });
  const paid = data?.[0];
  if (error || !paid) return { ok: false, error: "errors.generic" };

  revalidatePath(`/${locale}/pointage`);
  revalidatePath(`/${locale}/frais`);
  revalidatePath(`/${locale}/tableau-de-bord`);
  return { ok: true, days: paid.days, amount: Number(paid.amount) };
}
