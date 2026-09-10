import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Client Supabase pour Server Components, Server Actions et Route Handlers.
 *
 * Utilise la clé PUBLIABLE : toutes les requêtes passent donc par RLS, avec
 * l'identité de l'utilisateur connecté. C'est voulu — la sécurité vient des
 * policies Postgres, pas du code applicatif. Voir `daydream-db`.
 *
 * La clé secrète (`sb_secret_…` / `service_role`) contourne RLS : elle ne doit
 * jamais être utilisée ici, ni exposée au navigateur.
 *
 * Ne jamais mettre ce client dans une variable globale (Fluid compute) :
 * en créer un nouveau à chaque appel de fonction.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Appelé depuis un Server Component : l'écriture de cookies y est
            // interdite. Sans effet ici car le proxy rafraîchit déjà la
            // session à chaque requête (voir `src/proxy.ts`).
          }
        },
      },
    },
  );
}
