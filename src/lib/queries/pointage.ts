import { createClient } from "@/lib/supabase/server";
import { SHIFT_COLUMNS, type Shift } from "@/lib/pointage";
import type { IsoDate } from "@/lib/rental-range";

/**
 * Périodes de travail d'un intervalle de jours (bornes incluses), plus les
 * périodes encore OUVERTES quelle que soit leur date : un départ oublié la
 * veille doit apparaître aujourd'hui, pas disparaître du compteur.
 *
 * Aucun filtre de personne ici : la RLS (`work_shifts_select`) ne rend à un
 * employé que SES lignes, au propriétaire celles de toute l'équipe. Passer
 * `userId` pour se limiter à soi quand on est propriétaire.
 */
export async function getShifts(from: IsoDate, to: IsoDate, userId?: string): Promise<Shift[]> {
  const supabase = await createClient();
  let request = supabase
    .from("work_shifts")
    .select(SHIFT_COLUMNS)
    .or(`and(work_date.gte.${from},work_date.lte.${to}),clock_out.is.null`);
  if (userId) request = request.eq("user_id", userId);
  const { data, error } = await request.order("clock_in", { ascending: true }).limit(2000);
  if (error) throw error;
  return (data ?? []) as Shift[];
}

export type PointageMember = { id: string; full_name: string; is_active: boolean };

/**
 * L'équipe, pour les écrans du propriétaire — désactivés compris : leurs
 * heures d'un mois passé restent lisibles. `profiles_read` ne montre toutes
 * les lignes qu'à un administrateur.
 */
export async function getMembers(): Promise<PointageMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, is_active")
    .order("full_name");
  if (error) throw error;
  return data ?? [];
}
