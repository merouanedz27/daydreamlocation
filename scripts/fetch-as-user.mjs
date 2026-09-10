#!/usr/bin/env node
/**
 * Récupère une page de l'application EN ÉTANT CONNECTÉ, et en affiche un
 * résumé lisible.
 *
 *   node scripts/fetch-as-user.mjs <email> <mot-de-passe> <chemin> [...chemins]
 *
 * Sert à vérifier ce que voit réellement un utilisateur donné : un `staff` et
 * un `owner` ne doivent pas obtenir la même page. Sans cet outil, on ne
 * vérifierait que la couche données, jamais le rendu.
 *
 * Le cookie reproduit le format de `@supabase/ssr` : `base64-` suivi du JSON
 * de session encodé, découpé en morceaux `.0`, `.1`… au-delà de 3180 octets.
 * Si une mise à jour de la bibliothèque changeait ce format, ce script
 * cesserait de voir la session — et le signalerait en affichant une
 * redirection vers /login plutôt qu'un faux succès.
 */
import { readFileSync } from "node:fs";
import { argv, env, exit } from "node:process";

const [, , email, password, ...paths] = argv;
if (!email || !password || !paths.length) {
  console.error(
    "usage: node scripts/fetch-as-user.mjs <email> <mot-de-passe> <chemin> [...]",
  );
  exit(2);
}

try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !env[m[1]]) env[m[1]] = m[2];
  }
} catch {
  /* .env.local absent */
}

const BASE = env.APP_URL ?? "http://localhost:3000";
const { NEXT_PUBLIC_SUPABASE_URL: URL_, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: KEY } = env;
const ref = new URL(URL_).hostname.split(".")[0];

const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
const session = await res.json();
if (!session.access_token) {
  console.error("Connexion impossible :", JSON.stringify(session));
  exit(1);
}

const encoded =
  "base64-" + Buffer.from(JSON.stringify(session), "utf8").toString("base64");

// @supabase/ssr découpe au-delà de 3180 octets.
const CHUNK = 3180;
const name = `sb-${ref}-auth-token`;
const cookies =
  encoded.length <= CHUNK
    ? [`${name}=${encoded}`]
    : Array.from({ length: Math.ceil(encoded.length / CHUNK) }, (_, i) =>
        `${name}.${i}=${encoded.slice(i * CHUNK, (i + 1) * CHUNK)}`,
      );
const cookieHeader = cookies.join("; ");

const strip = (h) => h.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

for (const path of paths) {
  const r = await fetch(`${BASE}${path}`, {
    headers: { cookie: cookieHeader },
    redirect: "manual",
  });
  const location = r.headers.get("location");

  console.log(`\n=== ${path} -> HTTP ${r.status}${location ? ` -> ${location}` : ""}`);

  if (location?.includes("/login")) {
    console.log("  SESSION NON RECONNUE (redirigé vers la connexion)");
    continue;
  }
  if (r.status !== 200) continue;

  const html = await r.text();
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1];
  console.log("  titre :", h1 ? strip(h1) : "(aucun)");

  // Le texte visible, débarrassé des scripts : ce que l'utilisateur lit.
  const body = strip(
    (html.match(/<main[\s\S]*?<\/main>/) ?? html.match(/<body[\s\S]*<\/body>/) ?? [""])[0]
      .replace(/<script[\s\S]*?<\/script>/g, ""),
  );
  console.log("  texte :", body.slice(0, 320));
}
