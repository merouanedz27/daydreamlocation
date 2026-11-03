#!/usr/bin/env node
/**
 * Remplit `.env.local` avec les adresses et les clés de la base LOCALE
 * (Docker), lues dans `supabase status`.
 *
 *   npm run db:start   # démarre les conteneurs (une fois)
 *   npm run db:env     # écrit .env.local
 *
 * Seules les quatre variables Supabase sont réécrites ; les autres lignes du
 * fichier (VAPID, SMTP, CRON_SECRET…) sont gardées telles quelles. Ces clés
 * locales sont les clés de démonstration de la CLI : elles ne valent rien
 * hors de ce poste. Celles de la production vont dans Vercel et dans
 * `.env.production.local`, jamais ici.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { exit } from "node:process";

let status;
try {
  status = execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
} catch {
  console.error("Supabase local ne répond pas — lancer d'abord `npm run db:start` (Docker démarré).");
  exit(1);
}

const local = {};
for (const line of status.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
  if (m) local[m[1]] = m[2];
}

const values = {
  NEXT_PUBLIC_SUPABASE_URL: local.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: local.PUBLISHABLE_KEY ?? local.ANON_KEY,
  SUPABASE_SECRET_KEY: local.SECRET_KEY ?? local.SERVICE_ROLE_KEY,
  SUPABASE_DB_URL: local.DB_URL,
};
const missing = Object.entries(values).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.error(`Valeurs absentes de \`supabase status\` : ${missing.join(", ")}`);
  exit(1);
}

const FILE = ".env.local";
const lines = existsSync(FILE)
  ? readFileSync(FILE, "utf8").split(/\r?\n/)
  : readFileSync(".env.example", "utf8").split(/\r?\n/);

const written = new Set();
const out = lines.map((line) => {
  const key = line.match(/^\s*([A-Z0-9_]+)\s*=/)?.[1];
  if (key && key in values) {
    written.add(key);
    return `${key}=${values[key]}`;
  }
  return line;
});
for (const [key, value] of Object.entries(values)) {
  if (!written.has(key)) out.push(`${key}=${value}`);
}

writeFileSync(FILE, out.join("\n"));
console.log(`${FILE} pointe sur la base locale : ${values.NEXT_PUBLIC_SUPABASE_URL}`);
console.log(`Studio : ${local.STUDIO_URL ?? "http://127.0.0.1:56323"}`);
