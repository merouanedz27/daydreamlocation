import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/auth";

export type Member = {
  id: string;
  full_name: string;
  email: string | null;
  role: Role;
  is_active: boolean;
  created_at: string;
};

/**
 * L'équipe, actifs d'abord puis par nom.
 *
 * Aucun contrôle de rôle ici : `profiles_read` ne laisse voir toutes les lignes
 * qu'à un administrateur — un membre qui atteindrait cette requête ne
 * récupérerait que la sienne. La page ajoute `requireOwner` par-dessus, pour
 * répondre par une redirection plutôt que par une liste d'une seule ligne.
 */
export async function getTeam(): Promise<Member[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, is_active, created_at")
    .order("is_active", { ascending: false })
    .order("full_name");

  if (error) throw error;

  return (data ?? []).map((row) => ({ ...row, role: row.role as Role }));
}

export type NotificationMember = {
  id: string;
  full_name: string;
  email: string | null;
  is_active: boolean;
  notify_new_order: boolean;
  notify_daily: boolean;
  email_locale: "fr" | "ar";
};

/**
 * L'équipe ACTIVE et ses préférences d'e-mail, pour l'écran Notifications.
 * Même garde que `getTeam` : `profiles_read` ne montre tout qu'à un
 * administrateur, la page ajoute `requireOwner`.
 */
export async function getNotificationTeam(): Promise<NotificationMember[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, is_active, notify_new_order, notify_daily, email_locale")
    .eq("is_active", true)
    .order("full_name");

  if (error) throw error;

  return (data ?? []).map((row) => ({
    ...row,
    email_locale: row.email_locale === "ar" ? "ar" : "fr",
  }));
}
