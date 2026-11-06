import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { isUuid } from "@/lib/alteration-url";

/**
 * Les retouches, lues par `list_alterations()` — la SEULE porte du tailleur,
 * qui n'a aucune policy sur les tables. L'équipe du magasin passe par la même
 * fonction : les deux écrans montrent exactement la même chose.
 *
 * Jamais d'argent ni de téléphone : la fonction ne les rend pas.
 */
export type Alteration = Database["public"]["Functions"]["list_alterations"]["Returns"][number];

export type AlterationStatus = "a_faire" | "taillee";

/** Fenêtre de l'onglet « Taillées » : le mois écoulé suffit à retrouver une pièce. */
export const DONE_WINDOW_DAYS = 30;

export async function listAlterations(status: AlterationStatus): Promise<Alteration[]> {
  const supabase = await createClient();
  const since =
    status === "taillee"
      ? new Date(Date.now() - DONE_WINDOW_DAYS * 24 * 3600 * 1000).toISOString()
      : undefined;
  const { data, error } = await supabase.rpc("list_alterations", {
    p_status: status,
    p_done_since: since,
  });
  if (error) throw error;
  return data ?? [];
}

/** Une retouche par son id — la page ouverte par l'appareil photo du téléphone. */
export async function getAlteration(id: string): Promise<Alteration | null> {
  if (!isUuid(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_alterations", { p_id: id });
  if (error) return null;
  return data?.[0] ?? null;
}

/**
 * Pièces encore chez le tailleur — le compteur du lien « Retouches ». Lu à
 * chaque page : une requête `head` sur un index partiel, sans les lignes.
 */
export const countPendingAlterations = cache(async (): Promise<number> => {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("line_alterations")
    .select("id, orders!inner ( status )", { count: "exact", head: true })
    .eq("status", "a_faire")
    .not("order_line_id", "is", null)
    // Comme la liste : une commande annulée ne part plus chez le tailleur.
    .neq("orders.status", "annulee");
  if (error) return 0;
  return count ?? 0;
});

/** Retouches d'une commande, par ligne — la fiche commande. */
export async function getOrderAlterations(orderId: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("line_alterations")
    .select("id, order_line_id, note, status, done_at, printed_at")
    .eq("order_id", orderId);
  if (error) return [];
  return data ?? [];
}
