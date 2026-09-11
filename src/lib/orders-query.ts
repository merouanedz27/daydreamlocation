/**
 * Paramètres de la liste des commandes — module PUR.
 *
 * Séparé de `src/lib/queries/orders-list.ts` À DESSEIN : ce dernier importe le
 * client Supabase serveur, qui dépend de `next/headers`. Un composant client
 * qui aurait seulement besoin de `STATUSES` ou de `PAGE_SIZE` entraînerait
 * alors tout le serveur dans son bundle — et le build échoue.
 *
 * Ici : aucune dépendance. Constantes, types, et normalisation des paramètres
 * d'URL, utilisables des deux côtés.
 */

export const PAGE_SIZE = 25;

/**
 * LISTE BLANCHE des colonnes triables.
 *
 * `order()` reçoit un identifiant SQL : on ne lui passe JAMAIS la valeur brute
 * de l'URL. Une valeur inconnue retombe sur le tri par défaut plutôt que de
 * produire une erreur.
 */
export const SORTABLE = {
  event_date: "event_date",
  total_price: "total_price",
  balance: "balance",
  customer_name: "customer_name",
  order_no: "order_no",
} as const;

export type SortKey = keyof typeof SORTABLE;

export const STATUSES = ["reservee", "en_cours", "retournee", "annulee"] as const;
export type OrderStatus = (typeof STATUSES)[number];

export type OrderRow = {
  id: number;
  order_no: string;
  customer_name: string;
  customer_phone: string | null;
  event_date: string;
  pickup_date: string;
  status: string;
  total_price: number;
  amount_paid: number;
  balance: number | null;
  caution_amount: number;
};

export type OrdersQuery = {
  q: string;
  status: OrderStatus | null;
  sort: SortKey;
  ascending: boolean;
  page: number;
};

/** Normalise les paramètres d'URL : tout ce qui est inconnu est ignoré. */
export function parseOrdersQuery(params: {
  q?: string;
  statut?: string;
  tri?: string;
  sens?: string;
  page?: string;
}): OrdersQuery {
  const sort = (params.tri && params.tri in SORTABLE ? params.tri : "event_date") as SortKey;
  const page = Number.parseInt(params.page ?? "1", 10);

  return {
    q: (params.q ?? "").trim().slice(0, 80),
    status: STATUSES.includes(params.statut as OrderStatus)
      ? (params.statut as OrderStatus)
      : null,
    sort,
    // Les dates et les montants intéressent d'abord du plus grand au plus
    // petit ; les noms, eux, se lisent de A à Z.
    ascending: params.sens
      ? params.sens === "asc"
      : sort === "customer_name" || sort === "order_no",
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** Échappe ce qui casserait la syntaxe `or(...)` de PostgREST. */
export function sanitizeSearch(term: string): string {
  return term.replace(/[(),"*\\]/g, " ").trim();
}
