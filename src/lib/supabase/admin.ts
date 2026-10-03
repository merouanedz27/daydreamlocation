import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Client Supabase à clé SECRÈTE — il CONTOURNE RLS.
 *
 * `import "server-only"` fait ÉCHOUER LE BUILD si ce fichier entre, même
 * indirectement, dans un bundle client. C'est la seule protection mécanique
 * contre une clé secrète expédiée au navigateur ; l'absence de préfixe
 * `NEXT_PUBLIC_` en est la seconde.
 *
 * DEUX RAISONS D'EXISTER :
 * - créer un compte `auth.users`, ce que l'API Data ne permet pas — et
 *   l'inscription publique est fermée par conception, puisque la clé publiable
 *   est visible dans chaque navigateur. Appelants : `createMember` et, pour
 *   couper le renouvellement de session d'un membre désactivé,
 *   `setMemberActive` (`src/lib/actions/team.ts`) ;
 * - les e-mails de l'équipe (`src/lib/email/notify.ts`) : la tâche du soir n'a
 *   pas de session, et un membre `staff` ne lit pas les profils des autres.
 *   LECTURE SEULE, et rien qui sorte de l'e-mail : noms, adresses, commande.
 * Tout le reste de l'application passe par `src/lib/supabase/server.ts`,
 * donc par RLS.
 *
 * Le RÔLE n'est jamais écrit par ce client : `handle_new_user` force `staff` +
 * inactif, et `createMember` pose le rôle réel par une SECONDE écriture, à
 * travers RLS, sous l'identité de l'administrateur. Le bit privilégié ne
 * transite donc jamais par la clé secrète.
 *
 * Les variables d'environnement sont lues DANS la fonction, jamais au niveau du
 * module : une clé absente doit casser le seul écran Équipe, pas `next build`
 * ni des routes qui n'ont rien à voir.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secret) {
    throw new Error("SUPABASE_SECRET_KEY absente : gestion de l'équipe et e-mails indisponibles.");
  }

  return createSupabaseClient<Database>(url, secret, {
    // Ce client ne doit ni lire ni écrire de cookie : il n'a pas de session.
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
