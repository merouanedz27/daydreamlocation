import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { refreshSession } from "@/lib/supabase/proxy";

/**
 * Next.js 16 a renommé `middleware.ts` en `proxy.ts` — la fonctionnalité est
 * identique. next-intl expose toujours `next-intl/middleware` : on l'importe
 * ici et on l'exporte sous le nom attendu par Next 16.
 *
 * Deux responsabilités, dans cet ordre :
 *   1. next-intl choisit la locale et produit la réponse (redirection /→/fr,
 *      réécriture…) ;
 *   2. Supabase rafraîchit la session en écrivant ses cookies SUR cette
 *      réponse. L'ordre importe : deux réponses concurrentes feraient perdre
 *      soit la locale, soit la session.
 *
 * Ce proxy ne fait AUCUN contrôle d'accès. La doc Next est explicite là-dessus,
 * et le bloc Supabase généré par le registre shadcn ne convenait pas tel quel :
 * il testait `pathname.startsWith('/login')` et redirigeait vers `/auth/login`,
 * or nos routes sont préfixées par la locale (`/fr/login`, `/ar/login`). Le
 * test n'aurait jamais été vrai → boucle de redirection infinie.
 *
 * L'authentification est vérifiée dans le layout `(app)`, et la véritable
 * garantie reste RLS côté Postgres. Voir `daydream-db`.
 */
const handleI18n = createMiddleware(routing);

export async function proxy(request: NextRequest) {
  const response = handleI18n(request);
  return refreshSession(request, response);
}

export const config = {
  // Tout sauf les routes d'API, les fichiers internes Next et les fichiers
  // statiques (qui contiennent un point).
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
