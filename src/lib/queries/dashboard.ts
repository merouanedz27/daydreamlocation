import { createClient } from "@/lib/supabase/server";
import { todayIso } from "@/lib/rental-range";

/**
 * Chiffres du tableau de bord.
 *
 * Tout vient de la fonction SQL `dashboard_stats` : agrégation en base, un
 * seul aller-retour, et aucune somme faite en JavaScript. Voir la migration
 * `20260911160000_dashboard_stats.sql` pour le détail des conventions —
 * notamment que la recette suit le RETRAIT, exclut les commandes annulées, et
 * n'inclut jamais la caution.
 */

export type PeriodTotals = {
  day: number;
  week: number;
  month: number;
  year: number;
};

export type MonthlyPoint = {
  /** « 2026-09 » */
  month: string;
  revenue: number;
  expenses: number;
};

export type StockState = {
  louee: number;
  disponible: number;
  nettoyage: number;
  reparation: number;
  retire: number;
};

/**
 * Ce qui est réservé mais pas encore sorti.
 *
 * Ce n'est PAS du chiffre d'affaires et l'écran ne doit jamais l'y ajouter :
 * c'est ce qui explique un mois à zéro quand toutes les commandes du registre
 * sont des mariages de décembre. Non borné par l'année — un mariage de janvier
 * prochain est réservé pour de bon.
 */
export type Upcoming = {
  count: number;
  total: number;
  /** Premier RETRAIT à venir, ou `null` s'il n'y a rien de réservé. */
  nextDate: string | null;
};

/**
 * Le CHIFFRE D'AFFAIRES au sens du propriétaire : le prix d'achat de toutes
 * les pièces du stock (retirées comprises), sans date. Ce n'est PAS ce que
 * rapportent les locations — celles-ci font le bénéfice.
 */
export type StockValue = { pieces: number; total: number };

export type DashboardStats = {
  today: string;
  stockValue: StockValue;
  revenue: PeriodTotals;
  /**
   * La CAISSE du jour, tirée du journal `order_payments` : les acomptes pris
   * aujourd'hui (`versement`) et les restes soldés aujourd'hui (`reste`), sur
   * toutes les commandes. `since` : premier jour journalisé — avant, inconnu.
   */
  cashToday: { versement: number; reste: number; since: string | null };
  expenses: PeriodTotals;
  monthly: MonthlyPoint[];
  stock: StockState;
  unpaid: { count: number; total: number };
  upcoming: Upcoming;
};

/** Postgres rend les `numeric` en JSON sous forme de nombres ; on sécurise. */
const num = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
};

const periods = (raw: Record<string, unknown> | undefined): PeriodTotals => ({
  day: num(raw?.day),
  week: num(raw?.week),
  month: num(raw?.month),
  year: num(raw?.year),
});

const EMPTY: DashboardStats = {
  today: new Date().toISOString().slice(0, 10),
  stockValue: { pieces: 0, total: 0 },
  revenue: { day: 0, week: 0, month: 0, year: 0 },
  cashToday: { versement: 0, reste: 0, since: null },
  expenses: { day: 0, week: 0, month: 0, year: 0 },
  monthly: [],
  stock: { louee: 0, disponible: 0, nettoyage: 0, reparation: 0, retire: 0 },
  unpaid: { count: 0, total: 0 },
  upcoming: { count: 0, total: 0, nextDate: null },
};

export async function getDashboardStats(): Promise<DashboardStats> {
  const supabase = await createClient();
  // Le jour de la BOUTIQUE (Alger), pas celui de la base (UTC).
  const { data, error } = await supabase.rpc("dashboard_stats", { p_today: todayIso() });

  // Un tableau de bord vide vaut mieux qu'un écran d'erreur : le reste de
  // l'application doit rester joignable même si l'agrégation échoue.
  if (error || !data) return EMPTY;

  const raw = data as Record<string, unknown>;
  const stock = (raw.stock ?? {}) as Record<string, unknown>;
  const unpaid = (raw.unpaid ?? {}) as Record<string, unknown>;
  const upcoming = (raw.upcoming ?? {}) as Record<string, unknown>;
  const stockValue = (raw.stockValue ?? {}) as Record<string, unknown>;
  const cash = (raw.cash ?? {}) as Record<string, unknown>;

  return {
    today: String(raw.today ?? EMPTY.today),
    stockValue: { pieces: num(stockValue.pieces), total: num(stockValue.total) },
    revenue: periods(raw.revenue as Record<string, unknown>),
    cashToday: {
      versement: num(cash.versement),
      reste: num(cash.reste),
      since: cash.since ? String(cash.since) : null,
    },
    expenses: periods(raw.expenses as Record<string, unknown>),
    monthly: ((raw.monthly ?? []) as Record<string, unknown>[]).map((m) => ({
      month: String(m.month),
      revenue: num(m.revenue),
      expenses: num(m.expenses),
    })),
    stock: {
      louee: num(stock.louee),
      disponible: num(stock.disponible),
      nettoyage: num(stock.nettoyage),
      reparation: num(stock.reparation),
      retire: num(stock.retire),
    },
    unpaid: { count: num(unpaid.count), total: num(unpaid.total) },
    upcoming: {
      count: num(upcoming.count),
      total: num(upcoming.total),
      // `min()` sur un registre vide rend `null` : aucune réservation à venir.
      nextDate: upcoming.nextDate ? String(upcoming.nextDate) : null,
    },
  };
}

export type UnpaidOrder = {
  id: number;
  order_no: string;
  customer_name: string;
  event_date: string;
  total_price: number;
  amount_paid: number;
  balance: number | null;
};

/**
 * Les commandes qui doivent encore de l'argent, la plus grosse dette d'abord.
 *
 * Le total et le nombre viennent de `dashboard_stats` (donc de la base, sans
 * plafond) ; cette requête sert à AFFICHER les lignes. `null` : toutes — le
 * tableau de bord en montre huit et déplie le reste (`UnpaidList`).
 */
export async function getUnpaidOrders(limit: number | null = 8): Promise<UnpaidOrder[]> {
  const supabase = await createClient();
  let query = supabase
    .from("orders")
    .select("id, order_no, customer_name, event_date, total_price, amount_paid, balance")
    .neq("status", "annulee")
    .gt("balance", 0)
    .order("balance", { ascending: false });
  if (limit !== null) query = query.limit(limit);
  const { data } = await query;

  return (data ?? []) as UnpaidOrder[];
}
