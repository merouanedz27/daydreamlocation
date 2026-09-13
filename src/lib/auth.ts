import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { redirectTo } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import type { Tables } from "@/lib/supabase/database.types";

export type Profile = Tables<"profiles">;

/**
 * Les deux seules valeurs admises par la contrainte `profiles_role_valid`.
 *
 * Le generateur de types ne lit pas les contraintes `check` : `database.types`
 * decrit `role` comme un `string` nu, et `profile.role === "ownr"` compilerait
 * sans broncher. Ce type ferme la porte.
 */
export type Role = "owner" | "staff";

/**
 * Profil de l'utilisateur connecté, ou `null`.
 *
 * `cache()` déduplique l'appel sur un même rendu : le layout, la barre de
 * navigation et la page peuvent tous demander le profil sans multiplier les
 * requêtes.
 *
 * On utilise `getUser()` et non `getSession()` : `getSession()` lit le cookie
 * sans le vérifier auprès du serveur d'auth, il est donc falsifiable. Ne jamais
 * fonder une décision d'accès sur `getSession()` côté serveur.
 */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  // Compte désactivé : traité comme non connecté.
  if (!data || !data.is_active) return null;

  return data;
});

/**
 * Exige une session valide. Redirige vers la connexion sinon.
 *
 * C'est ici que se fait le contrôle d'accès — pas dans le proxy, que la doc
 * Next déconseille explicitement pour l'authentification. La garantie ultime
 * reste RLS côté Postgres : même si cette fonction était contournée, la base
 * ne renverrait rien. Voir `daydream-db`.
 */
export async function requireProfile(locale: Locale): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirectTo("/login", locale);
  return profile;
}

/** Exige le rôle propriétaire (dépenses, tableau de bord financier). */
export async function requireOwner(locale: Locale): Promise<Profile> {
  const profile = await requireProfile(locale);
  if (profile.role !== "owner") redirectTo("/commandes", locale);
  return profile;
}

export function isOwner(profile: Profile | null): boolean {
  return profile?.role === "owner";
}
