import type { Tables } from "@/lib/supabase/database.types";

export type Expense = Tables<"expenses">;

export type ExpenseRow = Expense & {
  orders: { order_no: string; customer_name: string } | null;
};
