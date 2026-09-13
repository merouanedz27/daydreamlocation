"use server";

import { createClient } from "@/lib/supabase/server";
import { redirectTo } from "@/i18n/navigation";
import { signInSchema } from "@/lib/validation/auth";
import { routing, type Locale } from "@/i18n/routing";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; field?: "email" | "password" };

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
