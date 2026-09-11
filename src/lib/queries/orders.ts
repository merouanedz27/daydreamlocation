import { createClient } from "@/lib/supabase/server";
import { freeFrom, rentalRange, type IsoDate } from "@/lib/rental-range";
import type { Tables } from "@/lib/supabase/database.types";

export type Settings = Tables<"settings">;

/** Fenêtre de location par défaut et battement de nettoyage. Ligne unique. */
export async function getSettings(): Promise<Settings> {
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("*").single();

  // Repli sur les valeurs du schéma : une commande doit rester saisissable même
  // si la ligne de paramètres a disparu.
  return (
    data ?? {
      id: true,
      days_before_event: 1,
      days_after_event: 1,
      cleaning_buffer_days: 1,
      updated_at: new Date().toISOString(),
    }
  );
}

export type PickerUnit = {
  id: number;
  ref_code: string;
  size: string | null;
  length_cm: number | null;
  status: string;
  price_override: number | null;
};

export type PickerModel = {
  id: number;
  ref_code: string;
  name_fr: string;
  name_ar: string | null;
  photo_path: string | null;
  base_price: number;
  category_slug: string | null;
  category_fr: string | null;
  category_ar: string | null;
  units: PickerUnit[];
};

export type PickerEnsemble = {
  id: number;
  name: string;
  package_price: number | null;
  unit_ids: number[];
};

/**
 * Tout ce que l'assistant de commande doit connaître du stock.
 *
 * Chargé EN UNE FOIS côté serveur : le catalogue d'un loueur de costumes se
 * compte en centaines de pièces, pas en dizaines de milliers. Une recherche
 * par requête à chaque frappe serait plus lente et inutilisable sur un réseau
 * mobile algérien.
 */
export async function getOrderCatalogue(): Promise<{
  models: PickerModel[];
  ensembles: PickerEnsemble[];
}> {
  const supabase = await createClient();

  const [{ data: models }, { data: ensembles }] = await Promise.all([
    supabase
      .from("article_models")
      .select(
        `id, ref_code, name_fr, name_ar, photo_path, base_price,
         categories ( slug, name_fr, name_ar ),
         article_units ( id, ref_code, size, length_cm, status, price_override )`,
      )
      .eq("is_active", true)
      .order("ref_code"),
    supabase
      .from("ensembles")
      .select(`id, name, package_price, ensemble_items ( unit_id )`)
      .eq("is_active", true)
      .order("name"),
  ]);

  type RawModel = {
    id: number;
    ref_code: string;
    name_fr: string;
    name_ar: string | null;
    photo_path: string | null;
    base_price: number;
    categories: { slug: string; name_fr: string; name_ar: string } | null;
    article_units: PickerUnit[];
  };

  type RawEnsemble = {
    id: number;
    name: string;
    package_price: number | null;
    ensemble_items: { unit_id: number }[];
  };

  return {
    models: ((models ?? []) as unknown as RawModel[]).map((m) => ({
      id: m.id,
      ref_code: m.ref_code,
      name_fr: m.name_fr,
      name_ar: m.name_ar,
      photo_path: m.photo_path,
      base_price: m.base_price,
      category_slug: m.categories?.slug ?? null,
      category_fr: m.categories?.name_fr ?? null,
      category_ar: m.categories?.name_ar ?? null,
      // Une pièce retirée du stock n'a plus à apparaître nulle part.
      units: (m.article_units ?? []).filter((u) => u.status !== "retire"),
    })),
    ensembles: ((ensembles ?? []) as unknown as RawEnsemble[]).map((e) => ({
      id: e.id,
      name: e.name,
      package_price: e.package_price,
      unit_ids: (e.ensemble_items ?? []).map((i) => i.unit_id),
    })),
  };
}

export type Unavailability = {
  unitId: number;
  /** Premier jour où la pièce redevient louable. */
  freeFrom: IsoDate | null;
  orderNo: string | null;
};

/**
 * Pièces déjà prises sur une fenêtre donnée.
 *
 * ATTENTION — ceci ne DÉCIDE rien. La garantie contre la double-réservation
 * est la contrainte `EXCLUDE` de `order_lines`, appliquée par Postgres au
 * moment de l'écriture. Cette requête sert uniquement à GRISER les pièces dans
 * l'écran de saisie et à dire quand elles se libèrent : entre l'affichage et
 * la validation, un collègue peut très bien avoir réservé la même veste.
 *
 * Le filtre `ov` est l'opérateur de chevauchement de plages de Postgres, que
 * PostgREST expose tel quel : c'est la base qui compare, pas le JavaScript.
 */
export async function getUnavailableUnits(
  pickup: IsoDate,
  returnDue: IsoDate,
  cleaningBufferDays: number,
): Promise<Unavailability[]> {
  const supabase = await createClient();
  const candidate = rentalRange(pickup, returnDue, cleaningBufferDays);

  const { data, error } = await supabase
    .from("order_lines")
    .select("unit_id, rental_range, orders ( order_no )")
    .eq("is_active", true)
    .not("unit_id", "is", null)
    .filter("rental_range", "ov", candidate);

  if (error) throw error;

  type Row = {
    unit_id: number;
    rental_range: string | null;
    orders: { order_no: string } | null;
  };

  // Une pièce peut être prise par plusieurs commandes successives : on garde
  // la date de libération la PLUS TARDIVE, sinon on promettrait une pièce trop
  // tôt au client.
  const latest = new Map<number, Unavailability>();
  for (const row of (data ?? []) as unknown as Row[]) {
    const free = freeFrom(row.rental_range);
    const current = latest.get(row.unit_id);
    if (!current || (free && current.freeFrom && free > current.freeFrom)) {
      latest.set(row.unit_id, {
        unitId: row.unit_id,
        freeFrom: free,
        orderNo: row.orders?.order_no ?? null,
      });
    }
  }

  return [...latest.values()];
}

export type OrderLine = Tables<"order_lines">;
export type Order = Tables<"orders">;

export type OrderDetail = Order & {
  order_lines: OrderLine[];
  profiles: { full_name: string } | null;
};

/** Une commande et toutes ses lignes, pour la fiche. */
export async function getOrder(id: number): Promise<OrderDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(`*, order_lines (*), profiles ( full_name )`)
    .eq("id", id)
    .single();

  if (error) return null;
  return data as unknown as OrderDetail;
}
