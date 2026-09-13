import { createClient } from "@/lib/supabase/server";
import type { IsoDate } from "@/lib/rental-range";

export type DaySheetLine = {
  id: number;
  model_name_snapshot: string | null;
  size_snapshot: string | null;
  external_label: string | null;
  article_units: { ref_code: string } | null;
};

export type DaySheetOrder = {
  id: number;
  order_no: string;
  customer_name: string;
  customer_phone: string | null;
  pickup_date: IsoDate;
  event_date: IsoDate;
  return_due_date: IsoDate;
  balance: number | null;
  caution_amount: number;
  caution_returned: boolean;
  order_lines: DaySheetLine[];
};

const COLUMNS = `id, order_no, customer_name, customer_phone, pickup_date, event_date,
  return_due_date, balance, caution_amount, caution_returned,
  order_lines ( id, model_name_snapshot, size_snapshot, external_label,
                article_units ( ref_code ) )`;

/**
 * La feuille du jour : ce qui doit SORTIR et ce qui doit RENTRER.
 *
 * Elle suit les deux cases « Aller validé » / « Retour validé », pas le seul
 * calendrier — exactement comme la frise de la fiche commande. Une commande
 * dont le retrait est prévu hier mais que personne n'a coché est toujours À
 * PRÉPARER : l'oublier parce que sa date est passée, c'est laisser un client
 * sans costume le jour de son mariage.
 *
 * - Retraits : pas encore retirée, retrait prévu au plus tard ce jour, et
 *   l'événement pas encore passé. Au-delà de l'événement, ce n'est plus un
 *   retrait en retard mais une commande à régulariser — pas le travail du
 *   comptoir ce matin.
 * - Retours : retirée, pas encore rendue, retour prévu au plus tard ce jour.
 *   Les retards y restent, jusqu'à ce que quelqu'un coche le retour.
 *
 * Une commande annulée n'apparaît dans aucune des deux listes.
 */
export async function getDaySheet(date: IsoDate): Promise<{
  pickups: DaySheetOrder[];
  returns: DaySheetOrder[];
}> {
  const supabase = await createClient();

  const [pickups, returns] = await Promise.all([
    supabase
      .from("orders")
      .select(COLUMNS)
      .neq("status", "annulee")
      .eq("picked_up", false)
      .lte("pickup_date", date)
      .gte("event_date", date)
      .order("pickup_date")
      .order("customer_name")
      .order("id", { referencedTable: "order_lines", ascending: true }),
    supabase
      .from("orders")
      .select(COLUMNS)
      .neq("status", "annulee")
      .eq("picked_up", true)
      .eq("returned", false)
      .lte("return_due_date", date)
      .order("return_due_date")
      .order("customer_name")
      .order("id", { referencedTable: "order_lines", ascending: true }),
  ]);

  return {
    pickups: (pickups.data ?? []) as unknown as DaySheetOrder[],
    returns: (returns.data ?? []) as unknown as DaySheetOrder[],
  };
}
