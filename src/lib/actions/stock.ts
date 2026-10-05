"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile, canManageStock } from "@/lib/auth";
import type { ZodError } from "zod";
import {
  modelSchema,
  modelUpdateSchema,
  unitSchema,
  unitUpdateSchema,
} from "@/lib/validation/stock";
import { nextUnitRefs } from "@/lib/stock-refs";
import { PHOTO_BUCKET } from "@/lib/storage";
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

/** Code Postgres d'une violation de clé étrangère (`on delete restrict`). */
const FOREIGN_KEY_VIOLATION = "23503";

/**
 * Première erreur Zod, ramenée à quelque chose d'AFFICHABLE.
 *
 * Deux garde-fous, appris d'un bug qui a fait échouer toute création de modèle
 * sans le moindre message à l'écran :
 *
 * 1. Zod produit ses propres messages en anglais quand la règle n'en fournit
 *    pas (« expected string, received null »). L'interface les passe à `t()`,
 *    qui ne trouve pas la clé — l'erreur se volatilise. On ne laisse donc
 *    sortir que des clés `errors.*`.
 * 2. Le champ fautif peut ne pas exister dans le formulaire. On ne le renvoie
 *    que s'il est effectivement saisissable, faute de quoi l'appelant
 *    accrocherait le message à un champ absent — donc invisible.
 */
function firstIssue(
  error: ZodError,
  visibleFields: readonly string[],
): { ok: false; error: string; field?: string } {
  const issue = error.issues[0];
  const field = String(issue.path[0] ?? "");
  return {
    ok: false,
    error: issue.message.startsWith("errors.") ? issue.message : "errors.generic",
    field: visibleFields.includes(field) ? field : undefined,
  };
}

/** Champs réellement rendus par `ModelForm` — voir `firstIssue`. */
const MODEL_FIELDS = ["ref_code", "name_fr", "category_id", "base_price"] as const;

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
  if (!canManageStock(profile)) return { ok: false, error: "errors.forbidden" };

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

  if (!parsed.success) return firstIssue(parsed.error, MODEL_FIELDS);

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

  // La liste est rafraîchie AVANT la redirection, sinon l'employé arrive sur
  // un catalogue où son modèle ne figure pas encore.
  revalidatePath(`/${locale}/stock`);
  revalidatePath(`/${locale}/stock/${data.id}`);
  redirectTo("/stock", locale);
}

/** Champs réellement rendus par `UnitForm` — voir `firstIssue`. */
const UNIT_FIELDS = [
  "sizes",
  "length_cm",
  "quantity",
  "price_override",
  "purchase_price",
] as const;

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
  if (!canManageStock(profile)) return { ok: false, error: "errors.forbidden" };

  const parsed = unitSchema.safeParse({
    model_id: formData.get("model_id"),
    sizes: formData.getAll("sizes").map(String),
    length_cm: formData.get("length_cm"),
    price_override: formData.get("price_override"),
    purchase_price: formData.get("purchase_price"),
    condition: formData.get("condition") || "bon",
    quantity: formData.get("quantity") || 1,
  });

  if (!parsed.success) return firstIssue(parsed.error, UNIT_FIELDS);

  const { model_id, quantity, sizes, ...unit } = parsed.data;
  // Une série cochée décide du nombre : une pièce par taille, sans doublon.
  const series = [...new Set(sizes)];
  const count = series.length || quantity;
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
    count,
  );

  const rows = refs.map((ref_code, i) => ({
    ...unit,
    model_id,
    ref_code,
    size: series[i] ?? null,
  }));

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
 * Corrige une pièce DÉJÀ créée : sa taille, sa longueur, son prix.
 *
 * La référence ne change jamais (elle est sur l'étiquette du cintre), et les
 * commandes passées gardent la taille de leur instantané (`size_snapshot`).
 */
export async function updateUnit(formData: FormData): Promise<ActionResult> {
  const locale = resolveLocale(formData.get("locale"));

  const profile = await getProfile();
  if (!canManageStock(profile)) return { ok: false, error: "errors.forbidden" };

  const parsed = unitUpdateSchema.safeParse({
    id: formData.get("id"),
    size: formData.get("size"),
    length_cm: formData.get("length_cm"),
    price_override: formData.get("price_override"),
  });
  if (!parsed.success) return firstIssue(parsed.error, ["size", "length_cm", "price_override"]);

  const { id, ...changes } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("article_units")
    .update(changes)
    .eq("id", id)
    .select("model_id")
    .maybeSingle();

  if (error || !data) return { ok: false, error: "errors.generic" };

  revalidatePath(`/${locale}/stock/${data.model_id}`);
  revalidatePath(`/${locale}/stock`);
  return { ok: true };
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
  if (!canManageStock(profile)) return { ok: false, error: "errors.forbidden" };

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

/**
 * Modifie un modèle.
 *
 * La référence fournisseur reste modifiable — une faute de frappe se corrige.
 * En revanche, les pièces DÉJÀ créées gardent la leur : « Gio-079-01 » est
 * écrit sur l'étiquette du cintre, et c'est sous ce nom qu'elle figure dans les
 * commandes passées. La renommer ici falsifierait l'historique et ne changerait
 * rien à l'étiquette. Seules les pièces suivantes suivront le nouveau code —
 * le formulaire le dit à l'écran.
 */
export async function updateModel(formData: FormData): Promise<ActionResult> {
  const locale = resolveLocale(formData.get("locale"));

  const profile = await getProfile();
  if (!canManageStock(profile)) return { ok: false, error: "errors.forbidden" };

  const parsed = modelUpdateSchema.safeParse({
    id: formData.get("id"),
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

  if (!parsed.success) return firstIssue(parsed.error, MODEL_FIELDS);

  const { id, ...fields } = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase
    .from("article_models")
    .update(fields)
    .eq("id", id);

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { ok: false, error: "errors.refCodeTaken", field: "ref_code" };
    }
    return { ok: false, error: "errors.generic" };
  }

  revalidatePath(`/${locale}/stock`);
  revalidatePath(`/${locale}/stock/${id}`);
  redirectTo(`/stock/${id}`, locale);
}

/**
 * Supprime un modèle ET ses pièces, définitivement.
 *
 * Réservé au modèle saisi par erreur. Dès qu'une seule de ses pièces a servi
 * dans une commande, la suppression est REFUSÉE : `order_lines.unit_id` est en
 * `on delete restrict`. On renvoie alors de quoi proposer le retrait du
 * catalogue (`setModelActive`), qui masque le modèle sans toucher aux comptes
 * passés.
 *
 * C'est la BASE qui tranche, pas un test JavaScript préalable : le `delete`
 * des pièces est une seule instruction, donc atomique. Si une pièce est
 * référencée, Postgres refuse l'instruction entière et aucune autre n'est
 * effacée. Un contrôle en JavaScript, lui, laisserait une fenêtre entre la
 * vérification et l'effacement.
 */
export async function deleteModel(formData: FormData): Promise<ActionResult> {
  const locale = resolveLocale(formData.get("locale"));

  const profile = await getProfile();
  if (!canManageStock(profile)) return { ok: false, error: "errors.forbidden" };

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "errors.generic" };

  const outcome = await eraseModel(await createClient(), id);
  if (outcome !== "deleted") {
    return { ok: false, error: outcome === "inUse" ? "errors.modelInUse" : "errors.generic" };
  }

  revalidatePath(`/${locale}/stock`);
  redirectTo("/stock", locale);
}

/**
 * Efface un modèle et ses pièces — ou dit pourquoi c'est impossible.
 * Partagé par la fiche (`deleteModel`) et l'appui long du catalogue
 * (`removeModel`).
 */
async function eraseModel(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: number,
): Promise<"deleted" | "inUse" | "error"> {
  const { data: model } = await supabase
    .from("article_models")
    .select("photo_path")
    .eq("id", id)
    .single();

  if (!model) return "error";

  const { error: unitsError } = await supabase
    .from("article_units")
    .delete()
    .eq("model_id", id);
  if (unitsError) return unitsError.code === FOREIGN_KEY_VIOLATION ? "inUse" : "error";

  const { error } = await supabase.from("article_models").delete().eq("id", id);
  if (error) return error.code === FOREIGN_KEY_VIOLATION ? "inUse" : "error";

  // La photo ne part qu'APRÈS la ligne : un fichier orphelin ne coûte que
  // quelques kilo-octets, alors qu'une fiche pointant vers une image effacée
  // afficherait un trou à l'écran. On ignore l'échec pour la même raison.
  if (model.photo_path) {
    await supabase.storage.from(PHOTO_BUCKET).remove([model.photo_path]);
  }
  return "deleted";
}

/**
 * « Supprimer » depuis le catalogue (appui long sur un modèle).
 *
 * Un modèle jamais loué est EFFACÉ. Un modèle déjà loué ne peut pas l'être —
 * ses commandes passées le désignent, la base refuse (`on delete restrict`) :
 * il est alors RETIRÉ du catalogue, ce qui le fait disparaître du stock et de
 * la saisie sans toucher aux comptes. `retired` dit lequel des deux a eu lieu.
 */
export async function removeModel(
  formData: FormData,
): Promise<{ ok: true; retired: boolean } | { ok: false; error: string }> {
  const locale = resolveLocale(formData.get("locale"));

  const profile = await getProfile();
  if (!canManageStock(profile)) return { ok: false, error: "errors.forbidden" };

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "errors.generic" };

  const supabase = await createClient();
  const outcome = await eraseModel(supabase, id);
  if (outcome === "error") return { ok: false, error: "errors.generic" };

  if (outcome === "inUse") {
    const { error } = await supabase
      .from("article_models")
      .update({ is_active: false })
      .eq("id", id);
    if (error) return { ok: false, error: "errors.generic" };
  }

  revalidatePath(`/${locale}/stock`);
  return { ok: true, retired: outcome === "inUse" };
}

/**
 * Retire un modèle du catalogue, ou l'y remet.
 *
 * C'est la suppression des modèles qui ont une histoire : le costume vendu ou
 * hors d'usage disparaît des listes et de la saisie de commande, mais ses
 * locations passées restent dans les comptes. Rien n'est effacé, donc rien
 * n'est perdu — et le geste se défait.
 */
export async function setModelActive(formData: FormData): Promise<ActionResult> {
  const locale = resolveLocale(formData.get("locale"));

  const profile = await getProfile();
  if (!canManageStock(profile)) return { ok: false, error: "errors.forbidden" };

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "errors.generic" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("article_models")
    .update({ is_active: formData.get("active") === "1" })
    .eq("id", id);

  if (error) return { ok: false, error: "errors.generic" };

  revalidatePath(`/${locale}/stock`);
  revalidatePath(`/${locale}/stock/${id}`);
  return { ok: true };
}
