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
 * On utilise `getClaims()` et non `getSession()` : `getSession()` lit le
 * cookie sans le vérifier, il est donc falsifiable. Ne jamais fonder une
 * décision d'accès sur `getSession()` côté serveur. `getClaims()` VÉRIFIE la
 * signature du jeton (clés publiques du projet, mises en cache) — sans l'aller-
 * retour réseau de `getUser()` vers le serveur d'auth à chaque page. Si le
 * projet signe encore ses jetons avec l'ancienne clé partagée, il retombe de
 * lui-même sur `getUser()`.
 */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims.sub;
  if (!userId) return null;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
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
