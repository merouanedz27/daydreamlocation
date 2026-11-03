/**
 * Choix de la base pour les scripts d'outillage (SQL, types, comptes).
 *
 * - Par défaut : la base LOCALE (Docker), lue dans `.env.local` — remplie par
 *   `npm run db:env` après `npm run db:start`.
 * - Avec `--prod` : la base de PRODUCTION, lue dans `.env.production.local`.
 *   Il faut le demander explicitement : un test ne touche jamais la
 *   production par accident.
 *
 * Les variables déjà présentes dans l'environnement gagnent (CI, Vercel).
 */
import { readFileSync } from "node:fs";
import { argv, env, exit } from "node:process";

export const PROD = argv.includes("--prod");

/** Les arguments de la ligne de commande, sans `--prod`. */
export const args = argv.slice(2).filter((a) => a !== "--prod");

/** Charge le bon fichier d'env (sans dépendance externe). */
export function loadEnv() {
  const file = PROD ? ".env.production.local" : ".env.local";
  try {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !env[m[1]]) env[m[1]] = m[2];
    }
  } catch {
    // Fichier absent : on se rabat sur l'environnement réel.
  }
  return file;
}

/**
 * Configuration `pg` pour SUPABASE_DB_URL. La base Docker n'a pas de TLS :
 * l'exiger y ferait échouer la connexion. Supabase en ligne, lui, l'impose.
 */
export function dbConfig() {
  const file = loadEnv();
  const connectionString = env.SUPABASE_DB_URL;
  if (!connectionString) {
    console.error(
      PROD
        ? `SUPABASE_DB_URL absent de ${file} (base de production).`
        : `SUPABASE_DB_URL absent de ${file} — lancer \`npm run db:start\` puis \`npm run db:env\`.`,
    );
    exit(2);
  }
  const host = new URL(connectionString).hostname;
  const local = host === "127.0.0.1" || host === "localhost";
  return { connectionString, ssl: local ? false : { rejectUnauthorized: false } };
}
