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

/**
 * Tailles de page proposées.
 *
 * LISTE BLANCHE, comme pour le tri : la valeur vient de l'URL et finit dans un
 * `.range()`. Une taille libre laisserait demander 100 000 lignes d'un coup
 * depuis la barre d'adresse — sur un réseau mobile algérien, c'est l'écran qui
 * ne s'affiche plus.
 *
 * 100 est le plafond volontairement bas : au-delà, la liste se parcourt moins
 * bien qu'avec la recherche et les filtres, qui eux travaillent sur TOUTE la
 * base et non sur la page affichée.
 */
export const PER_PAGE_OPTIONS = [10, 25, 50, 100] as const;

export const DEFAULT_PER_PAGE = 25;

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
  /** Sert au retard, qui se déduit du calendrier — il ne se stocke nulle part. */
  return_due_date: string;
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
  perPage: number;
};

/** Normalise les paramètres d'URL : tout ce qui est inconnu est ignoré. */
export function parseOrdersQuery(params: {
  q?: string;
  statut?: string;
  tri?: string;
  sens?: string;
  page?: string;
  taille?: string;
}): OrdersQuery {
  const sort = (params.tri && params.tri in SORTABLE ? params.tri : "event_date") as SortKey;
  const page = Number.parseInt(params.page ?? "1", 10);
  const perPage = Number.parseInt(params.taille ?? "", 10);

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
    perPage: (PER_PAGE_OPTIONS as readonly number[]).includes(perPage)
      ? perPage
      : DEFAULT_PER_PAGE,
  };
}

/** Échappe ce qui casserait la syntaxe `or(...)` de PostgREST. */
export function sanitizeSearch(term: string): string {
  return term.replace(/[(),"*\\]/g, " ").trim();
}

/**
 * Les FILTRES de la liste, traduits en paramètres PostgREST — sans le tri ni
 * la pagination.
 *
 * Partagés par l'écran et par l'export Excel : un fichier exporté doit
 * contenir EXACTEMENT les commandes qu'on voit filtrées à l'écran. Deux copies
 * de cette logique finiraient par diverger, et l'export mentirait sans bruit.
 */
export function ordersFilters(query: OrdersQuery): {
  /** Argument de `.or(...)`, ou `null` sans recherche. */
  search: string | null;
  status: OrderStatus | null;
} {
  const term = sanitizeSearch(query.q);
  return {
    // On cherche sur ce que l'équipe a sous les yeux quand le client appelle :
    // son nom, le numéro de commande, son téléphone.
    search: term
      ? `customer_name.ilike.%${term}%,order_no.ilike.%${term}%,customer_phone.ilike.%${term}%`
      : null,
    status: query.status,
  };
}
