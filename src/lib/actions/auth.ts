"use server";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { redirectTo } from "@/i18n/navigation";
import { changePasswordSchema, signInSchema } from "@/lib/validation/auth";
import { routing, type Locale } from "@/i18n/routing";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; field?: "email" | "password" };

export type PasswordResult =
  | { ok: true }
  | { ok: false; error: string; field?: "current" | "password" | "confirm" };

function resolveLocale(value: FormDataEntryValue | null): Locale {
  return routing.locales.includes(value as Locale)
    ? (value as Locale)
    : routing.defaultLocale;
}

/**
 * Connexion par e-mail + mot de passe.
 *
 * Le client serveur écrit les cookies de session ; le proxy les rafraîchit
 * ensuite à chaque requête (voir `src/proxy.ts`).
 *
 * Les erreurs remontent en CLÉS i18n. On ne distingue jamais « e-mail inconnu »
 * de « mot de passe faux » : cela permettrait d'énumérer les comptes existants.
 */
export async function signIn(formData: FormData): Promise<ActionResult> {
  const locale = resolveLocale(formData.get("locale"));

  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue.message,
      field: issue.path[0] as "email" | "password",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    return { ok: false, error: "errors.invalidCredentials" };
  }

  /**
   * GoTrue ne connaît pas `is_active` : il accepte volontiers les identifiants
   * d'un membre désactivé. Sans ce contrôle, celui-ci se connecterait
   * correctement, puis `requireProfile` le renverrait ici depuis le layout —
   * il retomberait donc sur ce formulaire AVEC LE BON MOT DE PASSE et SANS LA
   * MOINDRE EXPLICATION. On referme la session et on le dit.
   *
   * Ce n'est pas une énumération de comptes : il a déjà prouvé qu'il connaît
   * le mot de passe.
   */
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_active")
    .eq("id", data.user.id)
    .single();

  if (!profile?.is_active) {
    await supabase.auth.signOut();
    return { ok: false, error: "errors.accountDisabled" };
  }

  // `redirect` lève une exception par conception : rien ne s'exécute après.
  redirectTo("/commandes", locale);
}

export async function signOut(formData: FormData): Promise<void> {
  const locale = resolveLocale(formData.get("locale"));

  const supabase = await createClient();
  await supabase.auth.signOut();

  redirectTo("/login", locale);
}

/**
 * Changer SON PROPRE mot de passe.
 *
 * `resetMemberPassword` (écran Équipe) refuse d'agir sur son propre compte :
 * sans cette action, le propriétaire n'avait aucun moyen de changer le sien.
 *
 * L'ANCIEN MOT DE PASSE EST EXIGÉ. `updateUser` n'en demande aucun : un
 * téléphone laissé déverrouillé au comptoir suffirait sinon à s'approprier le
 * compte du patron. On le vérifie par une connexion sur un client JETABLE —
 * sans cookies, sans session persistée — pour ne pas toucher à la session en
 * cours, puis on referme la session de vérification.
 */
export async function changeOwnPassword(formData: FormData): Promise<PasswordResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { ok: false, error: "errors.forbidden" };

  const parsed = changePasswordSchema.safeParse({
    current: formData.get("current"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue.message.startsWith("errors.") ? issue.message : "errors.generic",
      field: issue.path[0] as "current" | "password" | "confirm",
    };
  }

  const verifier = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );

  const { error: checkError } = await verifier.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.current,
  });
  if (checkError) {
    return { ok: false, error: "errors.currentPasswordWrong", field: "current" };
  }
  // `local` : ne ferme QUE la session de vérification, pas celle du téléphone.
  await verifier.auth.signOut({ scope: "local" });

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    if (error.code === "weak_password") {
      return { ok: false, error: "errors.passwordTooShort", field: "password" };
    }
    if (error.code === "same_password") {
      return { ok: false, error: "errors.passwordSame", field: "password" };
    }
    return { ok: false, error: "errors.generic" };
  }

  return { ok: true };
}
