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
 * Commandes chargées à chaque fois que la liste arrive en bas. La liste se
 * DÉROULE, comme le tableau de son AppSheet : plus de pages ni de taille de
 * page à choisir. 40 lignes remplissent deux écrans de téléphone sans peser
 * sur un réseau mobile.
 */
export const ORDERS_BATCH = 40;

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
  /** « Allez validé » : la tenue est sortie. */
  picked_up: boolean;
  /** « Retour validé » : la tenue est revenue. */
  returned: boolean;
  total_price: number;
  amount_paid: number;
  balance: number | null;
  caution_amount: number;
};

/**
 * Une ligne du TABLEAU des commandes : la commande, plus ce que le client
 * emporte — les colonnes « Costume, Chemise, Chaussures… » de son AppSheet,
 * réunies en une seule.
 */
export type OrderTableRow = OrderRow & {
  /** « Invite Noir Simple (50 · P 52) », dans l'ordre de saisie. */
  pieces: string[];
  /** La colonne « Tailleur » : la note de la première pièce qui en porte une. */
  tailor: string | null;
  /**
   * Le membre qui a saisi la commande (`created_by`). Affiché au propriétaire
   * SEUL — et la policy `profiles_read` ne laisse de toute façon un employé
   * lire que son propre profil. `null` pour les commandes reprises du tableur.
   */
  created_by_name: string | null;
};

export type OrdersQuery = {
  q: string;
  status: OrderStatus | null;
  sort: SortKey;
  ascending: boolean;
};

/** Normalise les paramètres d'URL : tout ce qui est inconnu est ignoré. */
export function parseOrdersQuery(params: {
  q?: string;
  statut?: string;
  tri?: string;
  sens?: string;
}): OrdersQuery {
  const sort = (params.tri && params.tri in SORTABLE ? params.tri : "event_date") as SortKey;

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
  return {
    search: orderSearchFilter(query.q),
    status: query.status,
  };
}

/**
 * Argument `.or(...)` de la recherche d'une commande, ou `null` sans terme.
 * Partagé par toutes les listes de commandes (liste, calendrier, « Demain »,
 * « Pas rentrés ») : la barre de recherche de l'en-tête doit trouver la même
 * chose partout.
 *
 * On cherche sur ce que l'équipe a sous les yeux quand le client appelle :
 * son nom, le numéro de commande, son téléphone.
 */
export function orderSearchFilter(q: string | null | undefined): string | null {
  const term = sanitizeSearch((q ?? "").trim().slice(0, 80));
  return term
    ? `customer_name.ilike.%${term}%,order_no.ilike.%${term}%,customer_phone.ilike.%${term}%`
    : null;
}

/**
 * Commande TERMINÉE : « Aller validé » ET « Retour validé » cochés — la tenue
 * est partie et revenue. C'est le seul cas où son AppSheet barre le nom, et
 * l'équipe s'en sert pour écarter d'un coup d'œil ce qui n'appelle plus rien.
 */
export function isOrderDone(order: { picked_up: boolean; returned: boolean }): boolean {
  return order.picked_up && order.returned;
}

/**
 * Le trait qui barre le nom d'une commande terminée — épais et de la couleur
 * du texte, pour se lire même sur un nom court et en plein soleil. Partagé par
 * toutes les listes pour que « terminé » ait partout la même allure.
 */
export const DONE_NAME_CLASS =
  "text-muted-foreground line-through decoration-foreground/70 decoration-2";
