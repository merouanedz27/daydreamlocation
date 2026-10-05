"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { routing, type Locale } from "@/i18n/routing";

export type PressingResult = { ok: true; count: number } | { ok: false; error: string };

function resolveLocale(value: FormDataEntryValue | null): Locale {
  return routing.locales.includes(value as Locale)
    ? (value as Locale)
    : routing.defaultLocale;
}

/** Une sélection (« 4,7,12 »), sans doublon ni valeur folle. */
function parseIds(value: FormDataEntryValue | null): number[] {
  const ids = String(value ?? "")
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  return [...new Set(ids)];
}

/** Le prix du pressing, facultatif : vide = aucun frais. */
const costSchema = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : Number(v)))
  .pipe(
    z
      .number({ message: "errors.numberInvalid" })
      .min(0, { message: "errors.numberNegative" })
      .max(99_999_999)
      .nullable(),
  );

/**
 * Déplace des pièces vers le pressing ou depuis lui.
 *
 * Toute l'équipe y a droit, mais par la SEULE fonction `set_pressing` : la
 * policy de mise à jour des pièces reste réservée à la gestion du stock. La
 * fonction n'autorise que disponible ⇄ nettoyage, et écrit le frais du retour
 * dans la même transaction.
 */
async function move(formData: FormData, toPressing: boolean): Promise<PressingResult> {
  const locale = resolveLocale(formData.get("locale"));

  const profile = await getProfile();
  if (!profile) return { ok: false, error: "errors.forbidden" };

  const ids = parseIds(formData.get("ids"));
  if (!ids.length || ids.length > 100) return { ok: false, error: "errors.generic" };

  let cost: number | null = null;
  if (!toPressing) {
    const parsed = costSchema.safeParse(String(formData.get("cost") ?? ""));
    if (!parsed.success) {
      const message = parsed.error.issues[0].message;
      return { ok: false, error: message.startsWith("errors.") ? message : "errors.generic" };
    }
    cost = parsed.data;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_pressing", {
    p_unit_ids: ids,
    p_in: toPressing,
    p_cost: cost,
  });

  if (error) return { ok: false, error: "errors.generic" };

  revalidatePath(`/${locale}/pressing`);
  revalidatePath(`/${locale}/stock`, "layout");
  if (!toPressing && cost) {
    revalidatePath(`/${locale}/frais`);
    revalidatePath(`/${locale}/tableau-de-bord`);
  }
  return { ok: true, count: data ?? 0 };
}

export async function sendToPressing(formData: FormData): Promise<PressingResult> {
  return move(formData, true);
}

export async function backFromPressing(formData: FormData): Promise<PressingResult> {
  return move(formData, false);
}
