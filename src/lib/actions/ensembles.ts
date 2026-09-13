"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile, isOwner } from "@/lib/auth";
import { ensembleSchema } from "@/lib/validation/ensembles";
import { redirectTo } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; field?: string };

function resolveLocale(value: FormDataEntryValue | null): Locale {
  return routing.locales.includes(value as Locale)
    ? (value as Locale)
    : routing.defaultLocale;
}

/** Champs réellement rendus par `EnsembleForm` : un autre n'aurait pas de place à l'écran. */
const FIELDS = ["name", "package_price", "description", "unit_ids"] as const;

/** Ce que `save_ensemble` refuse, traduit. Le reste reste générique. */
function dbError(message: string): { error: string; field?: string } {
  if (message.includes("ensemble_units_required")) {
    return { error: "errors.ensembleUnitsRequired", field: "unit_ids" };
  }
  if (message.includes("ensemble_unit_invalid")) {
    return { error: "errors.ensembleUnitInvalid", field: "unit_ids" };
  }
  if (message.includes("ensemble_name_required")) {
    return { error: "errors.required", field: "name" };
  }
  return { error: "errors.generic" };
}

/**
 * Crée ou modifie un ensemble — par `save_ensemble`, en une transaction.
 *
 * Le rôle est revérifié ici : une Server Action est un point d'entrée réseau
 * à part entière. RLS refuserait de toute façon ; on veut un message propre.
 */
export async function saveEnsemble(formData: FormData): Promise<ActionResult> {
  const locale = resolveLocale(formData.get("locale"));

  const profile = await getProfile();
  if (!isOwner(profile)) return { ok: false, error: "errors.forbidden" };

  const parsed = ensembleSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    description: formData.get("description"),
    package_price: formData.get("package_price"),
    unit_ids: formData.getAll("unit_id"),
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = String(issue.path[0] ?? "");
    return {
      ok: false,
      error: issue.message.startsWith("errors.") ? issue.message : "errors.generic",
      field: (FIELDS as readonly string[]).includes(field) ? field : undefined,
    };
  }

  const input = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase.rpc("save_ensemble", {
    p_id: input.id ?? undefined,
    p_name: input.name,
    p_description: input.description ?? undefined,
    p_package_price: input.package_price ?? undefined,
    p_unit_ids: input.unit_ids,
  });

  if (error) return { ok: false, ...dbError(error.message) };

  revalidatePath(`/${locale}/stock/ensembles`);
  // La saisie de commande charge les ensembles : elle doit voir la nouvelle liste.
  revalidatePath(`/${locale}/commandes/nouvelle`);
  redirectTo("/stock/ensembles", locale);
}

/**
 * Supprime un ensemble.
 *
 * Sans retour possible, mais sans rien casser : un ensemble n'est qu'un
 * raccourci de saisie. Les commandes passées gardent leurs lignes de pièces,
 * et les pièces restent au stock (`ensemble_items` part en cascade, rien
 * d'autre).
 */
export async function deleteEnsemble(formData: FormData): Promise<ActionResult> {
  const locale = resolveLocale(formData.get("locale"));

  const profile = await getProfile();
  if (!isOwner(profile)) return { ok: false, error: "errors.forbidden" };

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "errors.generic" };

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("ensembles")
    .delete({ count: "exact" })
    .eq("id", id);

  if (error || !count) return { ok: false, error: "errors.generic" };

  revalidatePath(`/${locale}/stock/ensembles`);
  revalidatePath(`/${locale}/commandes/nouvelle`);
  return { ok: true };
}
