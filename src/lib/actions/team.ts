"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile, isOwner, type Role } from "@/lib/auth";
import {
  createMemberSchema,
  resetPasswordSchema,
  MEMBER_ROLES,
} from "@/lib/validation/team";
import { routing, type Locale } from "@/i18n/routing";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; field?: string };

function resolveLocale(value: FormDataEntryValue | null): Locale {
  return routing.locales.includes(value as Locale)
    ? (value as Locale)
    : routing.defaultLocale;
}

/** Le garde-fou SQL `profiles_keep_one_active_owner` remonte par ce code. */
const RAISE_EXCEPTION = "P0001";

/**
 * Préambule commun aux quatre actions : session, rôle, et cible valide.
 *
 * Le contrôle de rôle est refait ICI même si la page porte déjà
 * `requireOwner` : une Server Action est un point d'entrée réseau à part
 * entière. RLS refuserait de toute façon — on veut un message propre plutôt
 * qu'une erreur Postgres brute.
 */
async function guard(
  targetId: string,
): Promise<{ ok: true; profileId: string } | { ok: false; error: string }> {
  const profile = await getProfile();
  if (!isOwner(profile)) return { ok: false, error: "errors.forbidden" };

  if (!targetId) return { ok: false, error: "errors.generic" };

  /**
   * Personne ne modifie son propre accès.
   *
   * Le garde-fou en base n'arrête que le DERNIER administrateur ; rien
   * n'empêcherait sinon un administrateur entouré de collègues de se
   * rétrograder ou se désactiver en pleine session — état à moitié déconnecté,
   * avec un `getProfile()` déjà mis en cache pour le rendu en cours, donc un
   * en-tête qui ment. Un autre administrateur peut toujours le faire.
   */
  if (targetId === profile!.id) return { ok: false, error: "errors.cannotEditSelf" };

  return { ok: true, profileId: profile!.id };
}

/** Traduit ce que la base refuse. Le reste reste générique. */
function dbError(error: { code?: string; message: string }): string {
  if (error.code === RAISE_EXCEPTION && error.message.includes("last_active_owner")) {
    return "errors.lastOwner";
  }
  return "errors.generic";
}

/**
 * Crée un compte membre.
 *
 * DEUX ÉCRITURES, ET C'EST VOULU.
 *
 * 1. La clé secrète crée le compte `auth.users` — c'est la seule chose que
 *    l'API Data ne sait pas faire. Le trigger `handle_new_user` en tire un
 *    profil `staff` INACTIF, sans jamais lire le rôle des métadonnées.
 * 2. Le rôle réel et l'activation s'écrivent ensuite avec l'identité de
 *    l'administrateur connecté, donc validés par `profiles_update_owner`.
 *
 * Le bit privilégié ne transite ainsi JAMAIS par la clé secrète. Et si la
 * seconde écriture échoue, ce qui reste est un compte inerte, pas un accès
 * ouvert.
 */
export async function createMember(formData: FormData): Promise<ActionResult> {
  const locale = resolveLocale(formData.get("locale"));

  const profile = await getProfile();
  if (!isOwner(profile)) return { ok: false, error: "errors.forbidden" };

  const parsed = createMemberSchema.safeParse({
    full_name: formData.get("full_name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue.message, field: String(issue.path[0] ?? "") };
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    // Clé absente de l'environnement : un seul écran est en panne, et il le dit.
    return { ok: false, error: "errors.adminUnavailable" };
  }

  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    // Sans SMTP, un compte non confirmé ne peut PAS se connecter : GoTrue
    // répondrait `email_not_confirmed`, que l'écran de connexion traduit en
    // « identifiants incorrects ». L'administrateur chercherait une faute de
    // frappe pendant une heure.
    email_confirm: true,
    user_metadata: { full_name: parsed.data.full_name },
  });

  if (authError || !created.user) {
    if (authError?.code === "email_exists") {
      return { ok: false, error: "errors.emailTaken", field: "email" };
    }
    if (authError?.code === "weak_password") {
      return { ok: false, error: "errors.passwordTooShort", field: "password" };
    }
    return { ok: false, error: "errors.generic" };
  }

  const userId = created.user.id;

  const supabase = await createClient();
  const { data: row, error: updateError } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.full_name,
      role: parsed.data.role,
      is_active: true,
    })
    .eq("id", userId)
    // `.select().maybeSingle()` et non `if (error)` seul : un UPDATE PostgREST
    // qui ne touche AUCUNE ligne renvoie 204 sans erreur. On rapporterait un
    // succès pour un compte resté inactif.
    .select("id")
    .maybeSingle();

  if (updateError || !row) {
    // Le compte n'a encore aucune commande : la cascade sur `profiles` ne
    // heurte aucune clé étrangère. Et si cette suppression échoue à son tour,
    // ce qui subsiste est un profil INACTIF, donc sans aucun accès.
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    return { ok: false, error: "errors.generic" };
  }

  revalidatePath(`/${locale}/equipe`);
  return { ok: true };
}

/** Promeut ou rétrograde. Le garde-fou en base protège le dernier admin. */
export async function setMemberRole(formData: FormData): Promise<ActionResult> {
  const locale = resolveLocale(formData.get("locale"));
  const targetId = String(formData.get("id") ?? "");

  const allowed = await guard(targetId);
  if (!allowed.ok) return { ok: false, error: allowed.error };

  const role = String(formData.get("role") ?? "");
  if (!MEMBER_ROLES.includes(role as Role)) {
    return { ok: false, error: "errors.generic" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", targetId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: dbError(error) };
  if (!data) return { ok: false, error: "errors.generic" };

  revalidatePath(`/${locale}/equipe`);
  return { ok: true };
}

/**
 * Désactive un départ, ou réactive un retour.
 *
 * `is_active` suffit à tout couper côté données : `private.is_staff()` le relit
 * à CHAQUE requête, donc toutes les tables répondent 403 dans la seconde, et
 * `getProfile()` renvoyant `null`, le layout renvoie vers la connexion.
 *
 * Le bannissement GoTrue règle l'autre moitié du problème : GoTrue ignore
 * `is_active` et renouvellerait donc indéfiniment la session à partir du jeton
 * de rafraîchissement. Il n'invalide PAS le jeton d'accès déjà émis — sa
 * signature se vérifie hors ligne, une heure durant — mais ce résidu ne donne
 * accès à rien.
 *
 * (`admin.auth.admin.signOut()` ne conviendrait pas : il exige le JWT du
 * membre, que l'administrateur ne détient évidemment pas.)
 */
export async function setMemberActive(formData: FormData): Promise<ActionResult> {
  const locale = resolveLocale(formData.get("locale"));
  const targetId = String(formData.get("id") ?? "");

  const allowed = await guard(targetId);
  if (!allowed.ok) return { ok: false, error: allowed.error };

  const active = formData.get("active") === "1";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ is_active: active })
    .eq("id", targetId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: dbError(error) };
  if (!data) return { ok: false, error: "errors.generic" };

  try {
    const admin = createAdminClient();
    await admin.auth.admin.updateUserById(targetId, {
      ban_duration: active ? "none" : "876000h",
    });
  } catch {
    // L'accès aux données est DÉJÀ coupé par `is_active`. Ne pas avoir pu
    // couper le renouvellement de session n'annule pas la désactivation.
  }

  revalidatePath(`/${locale}/equipe`);
  return { ok: true };
}

/**
 * Redonne un mot de passe à un membre qui l'a perdu.
 *
 * Sans SMTP, le produit n'a AUCUNE autre voie de récupération : « mot de passe
 * oublié » n'existe pas, et un membre enfermé dehors devrait attendre qu'on
 * ouvre une connexion SQL pour lui.
 */
export async function resetMemberPassword(formData: FormData): Promise<ActionResult> {
  const targetId = String(formData.get("id") ?? "");

  const allowed = await guard(targetId);
  if (!allowed.ok) return { ok: false, error: allowed.error };

  const parsed = resetPasswordSchema.safeParse({ password: formData.get("password") });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message, field: "password" };
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: "errors.adminUnavailable" };
  }

  const { error } = await admin.auth.admin.updateUserById(targetId, {
    password: parsed.data.password,
  });

  if (error) {
    if (error.code === "weak_password") {
      return { ok: false, error: "errors.passwordTooShort", field: "password" };
    }
    return { ok: false, error: "errors.generic" };
  }

  // Rien à revalider : aucun mot de passe n'est affiché nulle part.
  return { ok: true };
}
