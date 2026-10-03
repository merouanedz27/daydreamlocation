import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { freeFrom, rentalRange, type IsoDate } from "@/lib/rental-range";
import type { Tables } from "@/lib/supabase/database.types";
import { COSTUME_ITEMS, SHOE_ITEMS } from "@/lib/item-catalog";
import { normalizeSearch } from "@/lib/search";

export type Settings = Tables<"settings">;

/** Fenêtre de location par défaut et battement de nettoyage. Ligne unique. */
async function fetchSettings(): Promise<Settings> {
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
      shop_address: null,
      shop_phone: null,
      rental_terms_fr: null,
      rental_terms_ar: null,
      customer_message: null,
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

export type ItemSuggestion = {
  label: string;
  uses: number;
  /** Position habituelle dans la commande : 1 tenue, 2 chemise, 3 chaussures. */
  slot: number;
};

export type CustomerSuggestion = { name: string; phone: string | null };

/**
 * Ce que la saisie rapide propose pendant la frappe : les listes FIXES de
 * vêtements (`item-catalog`, ses listes AppSheet) et les clients déjà venus. Chargé en une fois, comme le catalogue —
 * quelques centaines de lignes, filtrées ensuite dans le navigateur sans
 * aller-retour réseau.
 *
 * Une suggestion manquante n'empêche jamais de saisir : en cas d'erreur, liste
 * vide, et l'employé tape le texte en entier.
 */
export async function getQuickSuggestions(): Promise<{
  items: ItemSuggestion[];
  customers: CustomerSuggestion[];
}> {
  const supabase = await createClient();
  const customers = await supabase.rpc("customer_suggestions");

  return {
    items: [
      ...COSTUME_ITEMS.map((label) => ({ label, uses: 0, slot: 1 })),
      ...SHOE_ITEMS.map((label) => ({ label, uses: 0, slot: 3 })),
    ],
    customers: (customers.data ?? []).map((r) => ({ name: r.name, phone: r.phone })),
  };
}

/**
 * La case HABITUELLE de chaque libellé déjà saisi (1 tenue … 4 accessoires),
 * apprise des commandes — y compris les libellés d'avant les listes fixes.
 * Ne sert qu'à REPLACER les pièces d'une commande existante dans leurs cases
 * (modification, bon de location), jamais à proposer quoi que ce soit.
 */
export async function getLabelSlots(): Promise<Map<string, number>> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("order_item_suggestions");
  const slots = new Map<string, number>();
  for (const r of data ?? []) slots.set(normalizeSearch(r.label), Number(r.slot));
  // Les listes fixes ont le dernier mot : un costume reste un costume.
  for (const label of COSTUME_ITEMS) slots.set(normalizeSearch(label), 1);
  for (const label of SHOE_ITEMS) slots.set(normalizeSearch(label), 3);
  return slots;
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
  /** En modification : les pièces de CETTE commande ne la bloquent pas. */
  excludeOrderId?: number,
): Promise<Unavailability[]> {
  const supabase = await createClient();
  const candidate = rentalRange(pickup, returnDue, cleaningBufferDays);

  let request = supabase
    .from("order_lines")
    .select("unit_id, rental_range, orders ( order_no )")
    .eq("is_active", true)
    .not("unit_id", "is", null)
    .filter("rental_range", "ov", candidate);
  if (excludeOrderId) request = request.neq("order_id", excludeOrderId);

  const { data, error } = await request;

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

/**
 * Une ligne de commande, plus la pièce réelle qu'elle désigne.
 *
 * `article_units` vaut `null` sur une PIÈCE EXTERNE (`unit_id` nul) : elle est
 * sous-louée chez un confrère, elle n'existe pas dans le stock. C'est ce qui
 * distingue les deux cas à l'affichage — pas une convention de libellé.
 *
 * Les libellés affichés restent ceux des colonnes `*_snapshot`, figées à la
 * création : si le patron renomme un modèle l'an prochain, une commande de
 * cette année doit continuer à dire ce que le client a réellement emporté.
 * La jointure ne sert qu'à la RÉFÉRENCE de la pièce et au lien vers sa fiche.
 */
export type OrderDetailLine = OrderLine & {
  article_units: { ref_code: string; model_id: number } | null;
};

export type OrderDetail = Order & {
  order_lines: OrderDetailLine[];
  profiles: { full_name: string } | null;
};

/** Une commande et toutes ses lignes, pour la fiche. */
async function fetchOrder(id: number): Promise<OrderDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      `*, profiles ( full_name ),
       order_lines ( *, article_units ( ref_code, model_id ) )`,
    )
    .eq("id", id)
    // Ordre d'affichage stable : sans `order`, PostgREST ne promet rien sur
    // les lignes imbriquées, et les pièces pourraient changer de place d'un
    // rechargement à l'autre sur la même commande.
    .order("id", { referencedTable: "order_lines", ascending: true })
    .single();

  if (error) return null;
  return data as unknown as OrderDetail;
}

/**
 * Nombre de dépenses rattachées à une commande (retouche, pressing…).
 *
 * Ne sert qu'à la confirmation de SUPPRESSION : ces frais ne partent pas avec
 * la commande (`on delete set null`), ils deviennent des charges générales. Le
 * propriétaire doit le savoir avant d'appuyer.
 *
 * Réservé au propriétaire par la RLS de `expenses` : pour `staff`, la requête
 * rend simplement zéro — et `staff` ne voit de toute façon pas le bouton.
 */
export async function countOrderExpenses(orderId: number): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("expenses")
    .select("id", { count: "exact", head: true })
    .eq("order_id", orderId);
  return count ?? 0;
}

/**
 * Une seule lecture par rendu : `cache()` partage le résultat entre
 * `generateMetadata`, le layout et la page d'une même requête.
 */
export const getSettings = cache(fetchSettings);
export const getOrder = cache(fetchOrder);
