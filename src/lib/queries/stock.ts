import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { addDays, type IsoDate } from "@/lib/rental-range";
import type { Tables } from "@/lib/supabase/database.types";

export type Category = Tables<"categories">;
export type ArticleModel = Tables<"article_models">;
export type ArticleUnit = Tables<"article_units">;

export type ModelWithStock = ArticleModel & {
  categories: Pick<Category, "id" | "slug" | "name_fr" | "name_ar"> | null;
  article_units: Pick<ArticleUnit, "id" | "size" | "status">[];
};

/**
 * Catalogue : modèles, leur catégorie et leurs pièces.
 *
 * On remonte les pièces avec le modèle plutôt qu'en une requête par ligne :
 * une liste de 50 modèles ferait sinon 51 allers-retours (`data-n-plus-one.md`
 * du skill `supabase-postgres-best-practices`).
 */
export async function getModels(options?: {
  categorySlug?: string;
  search?: string;
  /**
   * `true` = les modèles RETIRÉS du catalogue, et eux seuls.
   *
   * Les deux listes s'excluent : mêler un costume vendu aux costumes
   * louables ferait promettre à un client une pièce qui n'est plus dans la
   * boutique. Le retrait n'a d'intérêt que s'il retire vraiment.
   */
  archived?: boolean;
}): Promise<ModelWithStock[]> {
  const supabase = await createClient();

  let query = supabase
    .from("article_models")
    .select(
      `id, ref_code, name_fr, name_ar, category_id, color, brand, description,
       base_price, photo_path, is_active, created_at,
       categories ( id, slug, name_fr, name_ar ),
       article_units ( id, size, status )`,
    )
    .eq("is_active", !options?.archived)
    .order("ref_code");

  if (options?.categorySlug) {
    query = query.eq("categories.slug", options.categorySlug);
  }

  if (options?.search?.trim()) {
    const term = options.search.trim();
    // `or` avec `ilike` : la recherche porte sur ce que l'équipe a sous les
    // yeux — la référence fournisseur, le nom, la couleur.
    query = query.or(
      `ref_code.ilike.%${term}%,name_fr.ilike.%${term}%,name_ar.ilike.%${term}%,color.ilike.%${term}%`,
    );
  }

  const { data, error } = await query;
  if (error) throw error;

  // Le filtre par catégorie sur une relation imbriquée ne retire pas la ligne
  // parente : il met la relation à `null`. On termine donc côté serveur.
  const rows = (data ?? []) as unknown as ModelWithStock[];
  return options?.categorySlug ? rows.filter((m) => m.categories) : rows;
}

/**
 * Combien de modèles sont retirés du catalogue.
 *
 * Sert l'unique porte d'entrée vers ces modèles, en bas du stock. Sans elle,
 * un modèle retiré serait introuvable — et le geste, irréversible pour
 * l'utilisateur. `head: true` ne rapatrie aucune ligne, juste le compte.
 */
export async function countArchivedModels(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("article_models")
    .select("id", { count: "exact", head: true })
    .eq("is_active", false);
  return count ?? 0;
}

export async function getCategories(): Promise<Category[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("position");
  if (error) throw error;
  return data ?? [];
}

export type UnitWithHistory = ArticleUnit & {
  /**
   * Sert UNIQUEMENT à savoir si la pièce a déjà servi — donc si le modèle peut
   * encore s'effacer ou seulement se retirer du catalogue. Rien à voir avec la
   * disponibilité : on compte ici TOUTES les lignes, annulées comprises, parce
   * qu'une commande annulée reste dans les comptes de l'an dernier.
   */
  order_lines: { id: number }[];
};

export type ModelDetail = ArticleModel & {
  categories: Category | null;
  article_units: UnitWithHistory[];
};

async function fetchModel(id: number): Promise<ModelDetail | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("article_models")
    .select(
      `*, categories (*),
       article_units (
         *, order_lines ( id )
       )`,
    )
    .eq("id", id)
    .single();

  if (error) return null;
  return data as unknown as ModelDetail;
}

/**
 * Pièces bloquées un jour donné — UNE requête pour tout un écran.
 *
 * Remonter les lignes de commande imbriquées sous chaque pièce ferait grossir
 * la liste du stock avec tout l'historique de la boutique pour n'en retenir
 * qu'une poignée de jours. On demande donc l'inverse : les seules lignes
 * actives qui couvrent CE jour-là. C'est la base qui compare les plages
 * (`ov`, l'opérateur de chevauchement de Postgres), jamais le JavaScript.
 *
 * « Bloquée » et non « louée » : la plage inclut le battement de nettoyage,
 * une pièce rendue hier peut donc figurer ici.
 *
 * ATTENTION — ceci répond à « disponible CE JOUR-LÀ », pour l'affichage. La
 * disponibilité sur une fenêtre de location se décide en base, via la
 * contrainte d'exclusion — jamais ici. Voir `daydream-db`.
 */
export async function getBlockedUnitIds(day: IsoDate): Promise<Set<number>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("order_lines")
    .select("unit_id")
    .eq("is_active", true)
    .not("unit_id", "is", null)
    // Une journée en plage demi-ouverte : chevaucher `[j, j+1)`, c'est
    // exactement contenir `j`.
    .filter("rental_range", "ov", `[${day},${addDays(day, 1)})`);

  if (error) throw error;

  const ids = new Set<number>();
  for (const row of data ?? []) {
    if (row.unit_id !== null) ids.add(row.unit_id);
  }
  return ids;
}

/**
 * Une pièce est louable si son état matériel le permet ET si aucune commande
 * active ne la bloque ce jour-là.
 *
 * Règle UNIQUE, partagée par la liste du stock et la fiche modèle. Les deux
 * l'ont longtemps portée séparément — la liste ne regardait que `status` et
 * annonçait « 2/2 disponibles » alors qu'une veste était réservée.
 */
export function isUnitFree(
  unit: Pick<ArticleUnit, "id" | "status">,
  blockedUnitIds: ReadonlySet<number>,
): boolean {
  return unit.status === "disponible" && !blockedUnitIds.has(unit.id);
}

/** Compte les pièces d'un modèle, pour l'affichage en liste. */
export function countStock(
  units: Pick<ArticleUnit, "id" | "status">[],
  blockedUnitIds: ReadonlySet<number>,
) {
  const total = units.length;
  const available = units.filter((u) => isUnitFree(u, blockedUnitIds)).length;
  return { total, available, unavailable: total - available };
}

/**
 * Une seule lecture par rendu : `cache()` partage le résultat entre
 * `generateMetadata`, le layout et la page d'une même requête.
 */
export const getModel = cache(fetchModel);
