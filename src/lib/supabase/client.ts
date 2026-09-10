import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

/**
 * Client Supabase pour les Client Components ("use client").
 *
 * À n'utiliser que pour ce qui exige le navigateur : formulaire de connexion,
 * upload de photo depuis l'appareil photo, temps réel. Toute lecture ou
 * écriture de données passe de préférence par un Server Component ou une
 * Server Action — voir le skill `daydream-feature`.
 *
 * La clé publiable est visible dans le navigateur, par conception : ce qui
 * protège les données, ce sont les policies RLS.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
