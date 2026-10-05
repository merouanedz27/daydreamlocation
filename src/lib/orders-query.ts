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
 * emporte — les colonnes « Costume, Taille, Chemise, Chaussures,
 * Accessoires » de son AppSheet, calculées comme sur le bon de location.
 */
export type OrderTableRow = OrderRow & {
  costume: string | null;
  /** « 50 · G 48 · P 52 » : veste, gilet, pantalon. */
  sizes: string | null;
  /** La colonne « Tailleur » : la note portée par les pièces. */
  tailor: string | null;
  shirt: string | null;
  shoes: string | null;
  accessories: string | null;
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
  /** Bornes INCLUSES sur la date de l'ÉVÉNEMENT (`du` / `au` dans l'URL). */
  from: string | null;
  to: string | null;
};

/** Les paramètres d'URL de la liste — partagés par l'écran, la suite et l'export. */
export type OrdersParams = {
  q?: string;
  statut?: string;
  tri?: string;
  sens?: string;
  du?: string;
  au?: string;
};

export const ORDERS_PARAM_KEYS = ["q", "statut", "tri", "sens", "du", "au"] as const;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Une date `YYYY-MM-DD` réelle, ou `null` : un lien trafiqué n'atteint pas la base. */
function isoDay(value: string | undefined): string | null {
  if (!value || !ISO_DAY.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : value;
}

/** Normalise les paramètres d'URL : tout ce qui est inconnu est ignoré. */
export function parseOrdersQuery(params: OrdersParams): OrdersQuery {
  const sort = (params.tri && params.tri in SORTABLE ? params.tri : "event_date") as SortKey;
  let from = isoDay(params.du);
  let to = isoDay(params.au);
  // Bornes inversées : on comprend ce que l'employé voulait dire.
  if (from && to && from > to) [from, to] = [to, from];

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
    from,
    to,
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
export function ordersFilters(
  query: OrdersQuery,
  pieceOrderIds: number[] = [],
): {
  /** Argument de `.or(...)`, ou `null` sans recherche. */
  search: string | null;
  status: OrderStatus | null;
  /** Date de l'événement, bornes incluses. */
  from: string | null;
  to: string | null;
} {
  return {
    search: orderSearchFilter(query.q, pieceOrderIds),
    status: query.status,
    from: query.from,
    to: query.to,
  };
}

/**
 * Argument `.or(...)` de la recherche d'une commande, ou `null` sans terme.
 * Partagé par toutes les listes de commandes (liste, calendrier, « Demain »,
 * « Pas rentrés ») : la barre de recherche de l'en-tête doit trouver la même
 * chose partout.
 *
 * On cherche sur ce que l'équipe a sous les yeux quand le client appelle :
 * son nom, le numéro de commande, son téléphone — et ce qu'il emporte : les
 * commandes dont une PIÈCE porte ce nom (« Tuxedo B », « Bligha ») arrivent par
 * `pieceOrderIds`, trouvées au préalable dans `order_lines` (voir
 * `orderSearch` dans `queries/orders-list.ts`).
 */
export function orderSearchFilter(
  q: string | null | undefined,
  pieceOrderIds: number[] = [],
): string | null {
  const term = searchTerm(q);
  if (!term) return null;
  const filter = `customer_name.ilike.%${term}%,order_no.ilike.%${term}%,customer_phone.ilike.%${term}%`;
  return pieceOrderIds.length ? `${filter},id.in.(${pieceOrderIds.join(",")})` : filter;
}

/** Le terme de recherche nettoyé, ou une chaîne vide. */
export function searchTerm(q: string | null | undefined): string {
  return sanitizeSearch((q ?? "").trim().slice(0, 80));
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

/**
 * La COULEUR d'une commande, celle de toute sa ligne dans le tableau :
 * jaune réservée, rouge sortie (plus soutenu en retard), vert revenue, gris
 * annulée. Une seule source pour la liste et la fiche.
 */
export type OrderTone = "reserved" | "out" | "late" | "returned" | "cancelled";

/** La couleur de chaque statut, hors retard (qui se déduit de la date). */
export const STATUS_TONE: Record<OrderStatus, OrderTone> = {
  reservee: "reserved",
  en_cours: "out",
  retournee: "returned",
  annulee: "cancelled",
};

export function orderTone(
  order: { status: string; return_due_date: string },
  today: string,
): OrderTone {
  const tone = STATUS_TONE[order.status as OrderStatus] ?? "reserved";
  return tone === "out" && order.return_due_date < today ? "late" : tone;
}

/**
 * Les puces de filtre aux couleurs des LIGNES qu'elles filtrent : teinte
 * transparente au repos, pleine une fois choisie.
 */
export const FILTER_CHIP_CLASS: Record<OrderTone, { idle: string; active: string }> = {
  reserved: { idle: "bg-row-reserved/50 border-row-reserved", active: "bg-row-reserved" },
  out: { idle: "bg-row-out/50 border-row-out", active: "bg-row-out" },
  late: { idle: "bg-row-late/50 border-row-late", active: "bg-row-late" },
  returned: { idle: "bg-row-returned/50 border-row-returned", active: "bg-row-returned" },
  cancelled: { idle: "bg-row-cancelled/50 border-row-cancelled", active: "bg-row-cancelled" },
};

/** Fond de chaque cellule d'une ligne, selon sa couleur. */
export const ROW_TONE_CLASS: Record<OrderTone, string> = {
  reserved: "[&>td]:bg-row-reserved",
  out: "[&>td]:bg-row-out",
  late: "[&>td]:bg-row-late",
  returned: "[&>td]:bg-row-returned",
  cancelled: "[&>td]:bg-row-cancelled [&>td]:text-muted-foreground",
};

/** La pastille de statut, aux mêmes couleurs que la ligne mais plus franches. */
export const STATUS_BADGE_CLASS: Record<OrderTone, string> = {
  reserved: "bg-gold-soft text-foreground border-gold-strong/40",
  out: "bg-destructive/15 text-destructive border-destructive/30",
  late: "bg-destructive text-white border-transparent",
  returned: "bg-success-soft text-success-foreground border-success/30",
  cancelled: "bg-muted text-muted-foreground border-transparent",
};
