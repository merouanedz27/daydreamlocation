import { createClient } from "@/lib/supabase/server";
import { rangeContains } from "@/lib/rental-range";
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
    .eq("is_active", true)
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

export async function getCategories(): Promise<Category[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("position");
  if (error) throw error;
  return data ?? [];
}

export type UnitWithBookings = ArticleUnit & {
  order_lines: { rental_range: string | null; is_active: boolean }[];
};

export type ModelDetail = ArticleModel & {
  categories: Category | null;
  article_units: UnitWithBookings[];
};

export async function getModel(id: number): Promise<ModelDetail | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("article_models")
    .select(
      `*, categories (*),
       article_units (
         *, order_lines ( rental_range, is_active )
       )`,
    )
    .eq("id", id)
    .single();

  if (error) return null;
  return data as unknown as ModelDetail;
}

/**
 * Une pièce est louable si son état matériel le permet ET si aucune commande
 * active ne la bloque aujourd'hui.
 *
 * ATTENTION : ceci répond à « disponible MAINTENANT », pour l'affichage du
 * stock. La disponibilité sur des DATES données se décide en base, via la
 * contrainte d'exclusion — jamais ici. Voir `daydream-db`.
 */
export function isUnitFreeToday(unit: UnitWithBookings): boolean {
  if (unit.status !== "disponible") return false;

  const today = new Date().toISOString().slice(0, 10);
  return !unit.order_lines?.some(
    (line) => line.is_active && rangeContains(line.rental_range, today),
  );
}

/** Compte les pièces d'un modèle par état, pour l'affichage en liste. */
export function countStock(units: Pick<ArticleUnit, "status">[]) {
  const total = units.length;
  const available = units.filter((u) => u.status === "disponible").length;
  return { total, available, unavailable: total - available };
}
