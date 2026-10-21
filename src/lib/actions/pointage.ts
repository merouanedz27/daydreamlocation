"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getProfile, isOwner } from "@/lib/auth";
import { PAY_TYPES, type MarkKind, type PayType } from "@/lib/pointage";
import { routing, type Locale } from "@/i18n/routing";

export type ActionResult = { ok: true } | { ok: false; error: string };

function resolveLocale(value: unknown): Locale {
  return routing.locales.includes(value as Locale) ? (value as Locale) : routing.defaultLocale;
}

/**
 * Codes levés par les fonctions et les triggers du pointage :
 * P0001 = jour déjà payé, P0003 = jour futur ou hors de la période ouverte,
 * P0004 = case d'un autre type de paie (absence d'un remplaçant…).
 */
function failure(code: string | undefined): ActionResult {
  const key =
    code === "P0001"
      ? "pointage.errors.alreadyPaid"
      : code === "P0003"
        ? "pointage.errors.outOfPeriod"
        : code === "P0004"
          ? "pointage.errors.wrongPayType"
          : "errors.generic";
  return { ok: false, error: key };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^d{4}-d{2}-d{2}$/;
const KINDS: readonly MarkKind[] = ["absence", "presence"];

/**
 * L'employé coche une case d'un jour de SA période — son absence s'il est
 * permanent, sa présence s'il est remplaçant — aujourd'hui ou un jour oublié,
 * et la décoche tant que ce jour n'est pas payé (mauvais toucher).
 *
 * Les bornes et le type de paie sont tenus par la base (`mark_absent()` /
 * `mark_present()`, à la date d'Alger du serveur). L'employé n'a aucun droit
 * d'écriture direct sur `absences` ni `presences`.
 */
export async function setMyMark(
  localeValue: string,
  kind: MarkKind,
  day: string,
  on: boolean,
): Promise<ActionResult> {
  const locale = resolveLocale(localeValue);
  if (!(await getProfile())) return { ok: false, error: "errors.forbidden" };
  if (!KINDS.includes(kind) || !DAY.test(day)) return { ok: false, error: "errors.generic" };

  const supabase = await createClient();
  const { error } =
    kind === "presence"
      ? on
        ? await supabase.rpc("mark_present", { p_day: day })
        : await supabase.rpc("unmark_present", { p_day: day })
      : on
        ? await supabase.rpc("mark_absent", { p_day: day })
        : await supabase.rpc("unmark_absent", { p_day: day });
  if (error) return failure(error.code);

  revalidatePath(`/${locale}/pointage`);
  return { ok: true };
}

/**
 * Le propriétaire coche ou décoche la case de n'importe quel jour non payé
 * — un oubli, une erreur. Un jour déjà payé est refusé par la base (trigger).
 */
export async function setMark(
  localeValue: string,
  kind: MarkKind,
  userId: string,
  day: string,
  on: boolean,
): Promise<ActionResult> {
  const locale = resolveLocale(localeValue);
  const profile = await getProfile();
  if (!profile || !isOwner(profile)) return { ok: false, error: "errors.forbidden" };
  if (!KINDS.includes(kind) || !UUID.test(userId) || !DAY.test(day)) {
    return { ok: false, error: "errors.generic" };
  }

  const supabase = await createClient();
  const table = kind === "presence" ? "presences" : "absences";
  const { error } = on
    ? await supabase
        .from(table)
        .upsert(
          { user_id: userId, day, marked_by: profile.id },
          { onConflict: "user_id,day", ignoreDuplicates: true },
        )
    : await supabase.from(table).delete().eq("user_id", userId).eq("day", day);
  if (error) return failure(error.code);

  revalidatePath(`/${locale}/pointage`);
  return { ok: true };
}

/**
 * Permanent ou remplaçant. Ce n'est pas un rôle : les droits dans l'app ne
 * changent pas. Les cases déjà cochées de l'autre type restent en base mais
 * ne comptent plus — d'où le conseil, à l'écran, de changer juste après une
 * paie.
 */
export async function setPayType(
  localeValue: string,
  userId: string,
  payType: string,
): Promise<ActionResult> {
  const locale = resolveLocale(localeValue);
  const profile = await getProfile();
  if (!profile || !isOwner(profile)) return { ok: false, error: "errors.forbidden" };
  if (!UUID.test(userId) || !PAY_TYPES.includes(payType as PayType)) {
    return { ok: false, error: "errors.generic" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ pay_type: payType }).eq("id", userId);
  if (error) return failure(error.code);

  revalidatePath(`/${locale}/pointage`);
  revalidatePath(`/${locale}/equipe`);
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

/**
 * Paie d'un employé : jours payés × prix d'une journée — calendrier −
 * absences pour un permanent, présences pour un remplaçant. En UNE
 * transaction (`pay_worker()`), la base compte, ajoute la dépense « Salaire »
 * aux frais, garde le prix sur le profil et remet le compteur à zéro. Rend les jours, les absences et le
 * total réellement payés, pour le message.
 *
 * Le libellé de la dépense s'écrit dans la langue du propriétaire : c'est lui
 * qui relit ses frais.
 */
export async function payWorker(
  localeValue: string,
  userId: string,
  dailyRate: number,
): Promise<
  { ok: true; days: number; absences: number; amount: number } | { ok: false; error: string }
> {
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
  return { ok: true, days: paid.days, absences: paid.absences, amount: Number(paid.amount) };
}
