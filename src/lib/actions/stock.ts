"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile, isOwner } from "@/lib/auth";
import { modelSchema, unitSchema } from "@/lib/validation/stock";
import { nextUnitRefs } from "@/lib/stock-refs";
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

/** Code Postgres d'une violation d'unicité. */
const UNIQUE_VIOLATION = "23505";

/**
 * Crée un modèle.
 *
 * Le contrôle de rôle est refait ici et pas seulement dans la page : une Server
 * Action est un point d'entrée réseau à part entière, appelable directement.
 * RLS refuserait de toute façon l'écriture, mais on veut un message propre
 * plutôt qu'une erreur Postgres brute.
 */
export async function createModel(formData: FormData): Promise<ActionResult> {
  const locale = resolveLocale(formData.get("locale"));

  const profile = await getProfile();
  if (!isOwner(profile)) return { ok: false, error: "errors.forbidden" };

  const parsed = modelSchema.safeParse({
    ref_code: formData.get("ref_code"),
    name_fr: formData.get("name_fr"),
    name_ar: formData.get("name_ar"),
    category_id: formData.get("category_id"),
    color: formData.get("color"),
    brand: formData.get("brand"),
    description: formData.get("description"),
    base_price: formData.get("base_price"),
    photo_path: formData.get("photo_path") || null,
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue.message, field: String(issue.path[0]) };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("article_models")
    .insert(parsed.data)
    .select("id")
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { ok: false, error: "errors.refCodeTaken", field: "ref_code" };
    }
    return { ok: false, error: "errors.generic" };
  }

  revalidatePath(`/${locale}/stock`);
  redirectTo(`/stock/${data.id}`, locale);
}

/**
 * Ajoute une ou plusieurs pièces à un modèle.
 *
 * Les références sont DÉRIVÉES du code fournisseur : « Gio-079 » donne
 * « Gio-079-01 », « Gio-079-02 »… Le client garde ainsi ses codes habituels
 * tout en pouvant enfin distinguer deux vestes de même taille — ce que le
 * tableur ne permettait pas.
 */
export async function createUnits(formData: FormData): Promise<ActionResult> {
  const locale = resolveLocale(formData.get("locale"));

  const profile = await getProfile();
  if (!isOwner(profile)) return { ok: false, error: "errors.forbidden" };

  const parsed = unitSchema.safeParse({
    model_id: formData.get("model_id"),
    size: formData.get("size"),
    length_cm: formData.get("length_cm"),
    price_override: formData.get("price_override"),
    purchase_price: formData.get("purchase_price"),
    condition: formData.get("condition") || "bon",
    quantity: formData.get("quantity") || 1,
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue.message, field: String(issue.path[0]) };
  }

  const { model_id, quantity, ...unit } = parsed.data;
  const supabase = await createClient();

  const { data: model } = await supabase
    .from("article_models")
    .select("ref_code")
    .eq("id", model_id)
    .single();

  if (!model) return { ok: false, error: "errors.generic" };

  const { data: existing } = await supabase
    .from("article_units")
    .select("ref_code")
    .eq("model_id", model_id);

  // Même dérivation que celle annoncée par le formulaire — un seul module,
  // sinon l'employé verrait une référence et en obtiendrait une autre.
  const refs = nextUnitRefs(
    model.ref_code,
    (existing ?? []).map((r) => r.ref_code),
    quantity,
  );

  const rows = refs.map((ref_code) => ({ ...unit, model_id, ref_code }));

  const { error } = await supabase.from("article_units").insert(rows);

  if (error) {
    // Deux employés ajoutant des pièces au même instant peuvent viser le même
    // suffixe. La contrainte d'unicité protège ; on demande de réessayer.
    if (error.code === UNIQUE_VIOLATION) {
      return { ok: false, error: "errors.refCodeRace" };
    }
    return { ok: false, error: "errors.generic" };
  }

  revalidatePath(`/${locale}/stock/${model_id}`);
  redirectTo(`/stock/${model_id}`, locale);
}

/**
 * Change l'état matériel d'une pièce (nettoyage, réparation, retrait).
 *
 * Ne touche PAS à la disponibilité sur des dates : celle-ci se déduit des
 * commandes, via la contrainte d'exclusion. Voir `daydream-db`.
 */
export async function setUnitStatus(formData: FormData): Promise<ActionResult> {
  const locale = resolveLocale(formData.get("locale"));

  const profile = await getProfile();
  if (!isOwner(profile)) return { ok: false, error: "errors.forbidden" };

  const unitId = Number(formData.get("unit_id"));
  const status = String(formData.get("status"));
  const modelId = Number(formData.get("model_id"));

  if (!["disponible", "nettoyage", "reparation", "retire"].includes(status)) {
    return { ok: false, error: "errors.generic" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("article_units")
    .update({ status })
    .eq("id", unitId);

  if (error) return { ok: false, error: "errors.generic" };

  revalidatePath(`/${locale}/stock/${modelId}`);
  return { ok: true };
}
