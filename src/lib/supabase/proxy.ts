import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

/**
 * Rafraîchit la session Supabase et recopie les cookies mis à jour sur la
 * réponse fournie.
 *
 * POURQUOI ce helper prend une réponse en paramètre au lieu d'en créer une :
 * next-intl produit déjà la réponse (redirection vers /fr, réécriture de la
 * locale…). Si Supabase créait la sienne, l'une des deux écraserait l'autre —
 * soit la locale est perdue, soit la session l'est. On écrit donc les cookies
 * SUR la réponse de next-intl. Voir `src/proxy.ts`.
 *
 * Ce helper ne redirige JAMAIS. Le contrôle d'accès se fait dans le layout
 * `(app)` et, en dernier ressort, par RLS côté Postgres — la doc Next est
 * explicite : le proxy ne doit pas servir de solution d'authentification.
 */
export async function refreshSession(
  request: NextRequest,
  response: NextResponse,
): Promise<NextResponse> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // NE RIEN EXÉCUTER entre createServerClient et getClaims() : toute logique
  // insérée ici provoque des déconnexions aléatoires très difficiles à
  // diagnostiquer. C'est l'appel qui rafraîchit le jeton.
  await supabase.auth.getClaims();

  return response;
}
