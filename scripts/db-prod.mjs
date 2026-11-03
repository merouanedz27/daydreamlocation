#!/usr/bin/env node
/**
 * Commandes de la CLI Supabase contre la base de PRODUCTION.
 *
 *   npm run db:push:prod       # applique les migrations
 *   npm run db:advisors:prod   # audit sécurité + performance
 *
 * La chaîne de connexion vient de SUPABASE_DB_URL dans `.env.production.local`
 * (session pooler, port 5432 — le 6543 gère mal le DDL). Elle est passée par
 * ce script et non par `$SUPABASE_DB_URL` dans package.json : npm lance ses
 * scripts dans cmd.exe sous Windows, qui ne développe pas cette syntaxe.
 */
import { spawnSync } from "node:child_process";
import { env, exit } from "node:process";
import { args, loadEnv } from "./env.mjs";

const COMMANDS = {
  push: ["db", "push", "--yes"],
  advisors: ["db", "advisors"],
};

const command = COMMANDS[args[0]];
if (!command) {
  console.error(`usage: node scripts/db-prod.mjs <${Object.keys(COMMANDS).join("|")}> --prod`);
  exit(2);
}

loadEnv();
const url = env.SUPABASE_DB_URL;
if (!url || /127\.0\.0\.1|localhost/.test(url)) {
  console.error("SUPABASE_DB_URL de production absent de .env.production.local.");
  exit(2);
}

const { status } = spawnSync("npx", ["supabase", ...command, "--db-url", `"${url}"`], {
  stdio: "inherit",
  shell: true,
});
exit(status ?? 1);
