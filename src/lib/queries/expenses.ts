import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";

export type Expense = Tables<"expenses">;

export type ExpenseRow = Expense & {
  orders: { order_no: string; customer_name: string } | null;
};

/**
 * Dépenses d'un mois, la plus récente d'abord.
 *
 * RLS fait le cloisonnement : `expenses_owner_all` réserve la table au
 * propriétaire. Un `staff` obtiendrait une liste vide, pas une erreur — mais
 * la page est de toute façon derrière `requireOwner`.
 */
export async function getExpenses(month: string): Promise<ExpenseRow[]> {
  const supabase = await createClient();

  const from = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const to = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1))
    .toISOString()
    .slice(0, 10);

  const { data } = await supabase
    .from("expenses")
    .select("*, orders ( order_no, customer_name )")
    .gte("spent_on", from)
    .lt("spent_on", to)
    .order("spent_on", { ascending: false })
    .order("id", { ascending: false });

  return (data ?? []) as unknown as ExpenseRow[];
}

/** Commandes récentes, pour rattacher des frais à l'une d'elles. */
export async function getRecentOrders(limit = 50) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select("id, order_no, customer_name, event_date")
    .neq("status", "annulee")
    .order("event_date", { ascending: false })
    .limit(limit);

  return data ?? [];
}
