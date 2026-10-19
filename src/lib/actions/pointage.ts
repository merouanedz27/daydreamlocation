"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getProfile, isOwner } from "@/lib/auth";
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
 * L'employé coche une absence d'un jour de SA période — aujourd'hui, ou un
 * jour oublié — et la décoche tant que ce jour n'est pas payé (mauvais
 * toucher).
 *
 * Les bornes sont tenues par la base (`mark_absent()`, à la date d'Alger du
 * serveur). L'employé n'a aucun droit d'écriture direct sur `absences`.
 */
export async function setMyAbsence(
  localeValue: string,
  day: string,
  absent: boolean,
): Promise<ActionResult> {
  const locale = resolveLocale(localeValue);
  if (!(await getProfile())) return { ok: false, error: "errors.forbidden" };
  if (!DAY.test(day)) return { ok: false, error: "errors.generic" };

  const supabase = await createClient();
  const { error } = absent
    ? await supabase.rpc("mark_absent", { p_day: day })
    : await supabase.rpc("unmark_absent", { p_day: day });
  if (error) return failure(error.code);

  revalidatePath(`/${locale}/pointage`);
  return { ok: true };
}

/**
 * Le propriétaire coche ou décoche l'absence de n'importe quel jour non payé
 * — un oubli, une erreur. Un jour déjà payé est refusé par la base (trigger).
 */
export async function setAbsence(
  localeValue: string,
  userId: string,
  day: string,
  absent: boolean,
): Promise<ActionResult> {
  const locale = resolveLocale(localeValue);
  const profile = await getProfile();
  if (!profile || !isOwner(profile)) return { ok: false, error: "errors.forbidden" };
  if (!UUID.test(userId) || !DAY.test(day)) return { ok: false, error: "errors.generic" };

  const supabase = await createClient();
  const { error } = absent
    ? await supabase
        .from("absences")
        .upsert(
          { user_id: userId, day, marked_by: profile.id },
          { onConflict: "user_id,day", ignoreDuplicates: true },
        )
    : await supabase.from("absences").delete().eq("user_id", userId).eq("day", day);
  if (error) return failure(error.code);

  revalidatePath(`/${locale}/pointage`);
  return { ok: true };
}

/**
 * Premier jour de travail d'un employé : la paie ne compte rien avant. Sert
 * surtout aux employés déjà en poste quand l'application arrive. Vide = aucun.
 */
export async function setWorkStartDate(
  localeValue: string,
  userId: string,
  day: string | null,
): Promise<ActionResult> {
  const locale = resolveLocale(localeValue);
  const profile = await getProfile();
  if (!profile || !isOwner(profile)) return { ok: false, error: "errors.forbidden" };
  if (!UUID.test(userId) || (day !== null && !DAY.test(day))) {
    return { ok: false, error: "errors.generic" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ work_start_date: day })
    .eq("id", userId);
  if (error) return failure(error.code);

  revalidatePath(`/${locale}/pointage`);
  return { ok: true };
}

/** Jours d'un mois de paie complet (30, 28…) — réglage de toute l'équipe. */
export async function setPayMonthDays(localeValue: string, days: number): Promise<ActionResult> {
  const locale = resolveLocale(localeValue);
  const profile = await getProfile();
  if (!profile || !isOwner(profile)) return { ok: false, error: "errors.forbidden" };
  if (!Number.isInteger(days) || days < 20 || days > 31) {
    return { ok: false, error: "pointage.errors.monthDays" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("settings").update({ pay_month_days: days }).eq("id", true);
  if (error) return failure(error.code);

  revalidatePath(`/${locale}/pointage`);
  return { ok: true };
}

/**
 * Paie d'un employé : salaire mensuel ÷ N × (jours dus − absences). En UNE
 * transaction (`pay_worker()`), la base compte, ajoute la dépense « Salaire »
 * aux frais et remet le compteur à zéro. Rend les jours, les absences et le
 * total réellement payés, pour le message.
 *
 * Le libellé de la dépense s'écrit dans la langue du propriétaire : c'est lui
 * qui relit ses frais.
 */
export async function payWorker(
  localeValue: string,
  userId: string,
  monthlySalary: number,
): Promise<
  { ok: true; days: number; absences: number; amount: number } | { ok: false; error: string }
> {
  const locale = resolveLocale(localeValue);
  const profile = await getProfile();
  if (!profile || !isOwner(profile)) return { ok: false, error: "errors.forbidden" };
  if (!UUID.test(userId)) return { ok: false, error: "errors.generic" };
  if (!Number.isFinite(monthlySalary) || monthlySalary <= 0 || monthlySalary > 100_000_000) {
    return { ok: false, error: "pointage.errors.salaryRequired" };
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
    p_monthly_salary: Math.round(monthlySalary),
    p_description: description,
  });
  const paid = data?.[0];
  if (error || !paid) return { ok: false, error: "errors.generic" };

  revalidatePath(`/${locale}/pointage`);
  revalidatePath(`/${locale}/frais`);
  revalidatePath(`/${locale}/tableau-de-bord`);
  return { ok: true, days: paid.days, absences: paid.absences, amount: Number(paid.amount) };
}
