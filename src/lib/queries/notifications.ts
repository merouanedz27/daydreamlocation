import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];

/*
 * Lues dans le layout de TOUTES les pages : une erreur ici ne doit jamais
 * faire tomber l'application. On journalise et on affiche une cloche vide.
 */

export async function getUnreadNotificationCount(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);

  if (error) {
    console.error("[notifications] compteur", error);
    return 0;
  }
  return count ?? 0;
}

export async function getRecentNotifications(limit = 30): Promise<NotificationRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, recipient_id, order_id, kind, title_key, body_key, payload, dedupe_key, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[notifications] liste", error);
    return [];
  }
  return data ?? [];
}
