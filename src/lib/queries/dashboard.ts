import { createClient } from "@/lib/supabase/server";

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

export type DashboardStats = {
  today: string;
  revenue: PeriodTotals;
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
  revenue: { day: 0, week: 0, month: 0, year: 0 },
  expenses: { day: 0, week: 0, month: 0, year: 0 },
  monthly: [],
  stock: { louee: 0, disponible: 0, nettoyage: 0, reparation: 0, retire: 0 },
  unpaid: { count: 0, total: 0 },
  upcoming: { count: 0, total: 0, nextDate: null },
};

export async function getDashboardStats(): Promise<DashboardStats> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dashboard_stats", {});

  // Un tableau de bord vide vaut mieux qu'un écran d'erreur : le reste de
  // l'application doit rester joignable même si l'agrégation échoue.
  if (error || !data) return EMPTY;

  const raw = data as Record<string, unknown>;
  const stock = (raw.stock ?? {}) as Record<string, unknown>;
  const unpaid = (raw.unpaid ?? {}) as Record<string, unknown>;
  const upcoming = (raw.upcoming ?? {}) as Record<string, unknown>;

  return {
    today: String(raw.today ?? EMPTY.today),
    revenue: periods(raw.revenue as Record<string, unknown>),
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
 * plafond) ; cette requête ne sert qu'à AFFICHER les premières lignes.
 */
export async function getUnpaidOrders(limit = 8): Promise<UnpaidOrder[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select("id, order_no, customer_name, event_date, total_price, amount_paid, balance")
    .neq("status", "annulee")
    .gt("balance", 0)
    .order("balance", { ascending: false })
    .limit(limit);

  return (data ?? []) as UnpaidOrder[];
}
