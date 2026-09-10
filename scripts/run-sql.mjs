#!/usr/bin/env node
/**
 * Exécute un fichier SQL contre la base et affiche les jeux de résultats.
 *
 *   node scripts/run-sql.mjs supabase/tests/availability.sql
 *
 * POURQUOI ce script plutôt que `supabase db query -f` : la commande de la CLI
 * enveloppe le fichier dans un *prepared statement*, qui n'accepte qu'une seule
 * instruction. Nos tests ont besoin de plusieurs instructions dans UNE même
 * transaction (begin / do / select / rollback). `pg` utilise le protocole de
 * requête simple tant qu'aucun paramètre n'est passé, ce qui l'autorise.
 *
 * La chaîne de connexion vient de SUPABASE_DB_URL (.env.local) et n'est jamais
 * affichée.
 */
import { readFileSync } from "node:fs";
import { argv, env, exit } from "node:process";
import pg from "pg";

const file = argv[2];
if (!file) {
  console.error("usage: node scripts/run-sql.mjs <fichier.sql>");
  exit(2);
}

// Charge .env.local sans dépendance externe.
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !env[m[1]]) env[m[1]] = m[2];
  }
} catch {
  // .env.local absent : on se rabat sur l'environnement réel.
}

const connectionString = env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error("SUPABASE_DB_URL absent (.env.local ou environnement).");
  exit(2);
}

const sql = readFileSync(file, "utf8");
const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

function renderTable(rows) {
  const cols = Object.keys(rows[0]);
  const width = Object.fromEntries(
    cols.map((c) => [
      c,
      Math.max(c.length, ...rows.map((r) => String(r[c] ?? "").length)),
    ]),
  );
  const line = (cells) =>
    cells.map((cell, i) => String(cell ?? "").padEnd(width[cols[i]])).join("  ");

  console.log(line(cols));
  console.log(cols.map((c) => "-".repeat(width[c])).join("  "));
  for (const r of rows) console.log(line(cols.map((c) => r[c])));
}

try {
  await client.connect();
  const results = await client.query(sql);
  const sets = Array.isArray(results) ? results : [results];

  let printed = 0;
  for (const set of sets) {
    if (!set?.rows?.length) continue;
    if (printed++) console.log("");
    renderTable(set.rows);
  }
  if (!printed) console.log("(aucun jeu de résultats)");

  // Le bilan expose une colonne `verdict` : on en fait le code de sortie, pour
  // que le script soit utilisable en CI.
  const verdict = sets
    .flatMap((s) => s?.rows ?? [])
    .find((r) => "verdict" in r)?.verdict;
  if (verdict && verdict !== "TOUT PASSE") {
    console.error(`\n${verdict}`);
    exit(1);
  }
} catch (err) {
  console.error("Erreur SQL :", err.message);
  if (err.hint) console.error("Indice :", err.hint);
  if (err.where) console.error("Contexte :", err.where);
  exit(1);
} finally {
  await client.end().catch(() => {});
}
