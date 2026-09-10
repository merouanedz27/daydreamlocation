#!/usr/bin/env node
/**
 * Génère `src/lib/supabase/database.types.ts` en introspectant la base.
 *
 *   node scripts/gen-types.mjs
 *
 * POURQUOI ce script plutôt que `supabase gen types` : la commande officielle
 * lance pg-meta dans un conteneur (avec `--db-url`) ou passe par l'API de
 * gestion (avec `--project-id`, qui exige un jeton de compte). Ce projet
 * n'utilise ni Docker ni jeton : on lit directement le catalogue Postgres avec
 * la connexion déjà configurée.
 *
 * Le format de sortie reproduit celui de Supabase (Row / Insert / Update +
 * helpers Tables<>), afin que le code applicatif reste identique si l'on
 * revient un jour à l'outil officiel.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { env, exit } from "node:process";
import pg from "pg";

const OUT = "src/lib/supabase/database.types.ts";

try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !env[m[1]]) env[m[1]] = m[2];
  }
} catch {
  /* .env.local absent : on se rabat sur l'environnement réel. */
}

if (!env.SUPABASE_DB_URL) {
  console.error("SUPABASE_DB_URL absent (.env.local ou environnement).");
  exit(2);
}

/** Correspondance type Postgres -> type TypeScript. */
function tsType(udt) {
  if (udt.startsWith("_")) return `${tsType(udt.slice(1))}[]`;
  switch (udt) {
    case "bool":
      return "boolean";
    case "int2":
    case "int4":
    case "int8":
    case "float4":
    case "float8":
    case "numeric":
      return "number";
    case "json":
    case "jsonb":
      return "Json";
    // date, timestamptz, uuid, daterange, text… arrivent en chaîne côté client.
    default:
      return "string";
  }
}

const client = new pg.Client({
  connectionString: env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});

const COLUMNS_SQL = `
  select c.table_name, c.column_name, c.udt_name, c.is_nullable,
         c.column_default, c.is_identity, c.identity_generation, c.is_generated,
         t.table_type
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema = c.table_schema and t.table_name = c.table_name
  where c.table_schema = 'public'
  order by c.table_name, c.ordinal_position;
`;

const FK_SQL = `
  select
    con.conname            as constraint_name,
    src.relname            as table_name,
    srccol.attname         as column_name,
    tgt.relname            as foreign_table,
    tgtcol.attname         as foreign_column
  from pg_constraint con
  join pg_class src on src.oid = con.conrelid
  join pg_class tgt on tgt.oid = con.confrelid
  join pg_namespace n on n.oid = src.relnamespace
  join lateral unnest(con.conkey)  with ordinality as sk(attnum, ord) on true
  join lateral unnest(con.confkey) with ordinality as tk(attnum, ord)
    on tk.ord = sk.ord
  join pg_attribute srccol on srccol.attrelid = con.conrelid and srccol.attnum = sk.attnum
  join pg_attribute tgtcol on tgtcol.attrelid = con.confrelid and tgtcol.attnum = tk.attnum
  where con.contype = 'f' and n.nspname = 'public'
  order by src.relname, con.conname, sk.ord;
`;

try {
  await client.connect();
  const { rows: cols } = await client.query(COLUMNS_SQL);
  const { rows: fks } = await client.query(FK_SQL);

  if (!cols.length) {
    console.error("Aucune table trouvée dans le schéma public.");
    exit(1);
  }

  const tables = new Map();
  for (const c of cols) {
    if (c.table_type !== "BASE TABLE") continue;
    if (!tables.has(c.table_name)) tables.set(c.table_name, []);
    tables.get(c.table_name).push(c);
  }

  const fkByTable = new Map();
  for (const f of fks) {
    if (!fkByTable.has(f.table_name)) fkByTable.set(f.table_name, []);
    fkByTable.get(f.table_name).push(f);
  }

  const out = [];
  out.push("// GÉNÉRÉ AUTOMATIQUEMENT — NE PAS ÉDITER À LA MAIN.");
  out.push("// Régénérer avec :  npm run db:types");
  out.push("//");
  out.push("// Produit par scripts/gen-types.mjs, qui introspecte directement le");
  out.push("// catalogue Postgres (ni Docker ni jeton de compte requis).");
  out.push("");
  out.push("export type Json =");
  out.push("  | string");
  out.push("  | number");
  out.push("  | boolean");
  out.push("  | null");
  out.push("  | { [key: string]: Json | undefined }");
  out.push("  | Json[];");
  out.push("");
  out.push("export type Database = {");
  out.push("  public: {");
  out.push("    Tables: {");

  for (const [table, columns] of [...tables].sort()) {
    out.push(`      ${table}: {`);

    // --- Row : ce que la base renvoie -------------------------------------
    out.push("        Row: {");
    for (const c of columns) {
      const t = tsType(c.udt_name);
      const nullable = c.is_nullable === "YES" ? " | null" : "";
      out.push(`          ${c.column_name}: ${t}${nullable};`);
    }
    out.push("        };");

    // --- Insert : les colonnes générées sont interdites à l'écriture ------
    out.push("        Insert: {");
    for (const c of columns) {
      // `generated always as identity` et `generated always as ... stored`
      // ne peuvent pas être fournies (ex. orders.balance).
      if (c.is_generated === "ALWAYS") continue;
      if (c.is_identity === "YES" && c.identity_generation === "ALWAYS") continue;

      const t = tsType(c.udt_name);
      const nullable = c.is_nullable === "YES" ? " | null" : "";
      // Optionnelle si elle a un défaut ou si elle accepte NULL.
      const optional =
        c.column_default !== null || c.is_nullable === "YES" ? "?" : "";
      out.push(`          ${c.column_name}${optional}: ${t}${nullable};`);
    }
    out.push("        };");

    // --- Update : tout est optionnel --------------------------------------
    out.push("        Update: {");
    for (const c of columns) {
      if (c.is_generated === "ALWAYS") continue;
      if (c.is_identity === "YES" && c.identity_generation === "ALWAYS") continue;
      const t = tsType(c.udt_name);
      const nullable = c.is_nullable === "YES" ? " | null" : "";
      out.push(`          ${c.column_name}?: ${t}${nullable};`);
    }
    out.push("        };");

    // --- Relationships ------------------------------------------------------
    const rels = fkByTable.get(table) ?? [];
    if (!rels.length) {
      out.push("        Relationships: [];");
    } else {
      out.push("        Relationships: [");
      for (const r of rels) {
        out.push("          {");
        out.push(`            foreignKeyName: "${r.constraint_name}";`);
        out.push(`            columns: ["${r.column_name}"];`);
        out.push("            isOneToOne: false;");
        out.push(`            referencedRelation: "${r.foreign_table}";`);
        out.push(`            referencedColumns: ["${r.foreign_column}"];`);
        out.push("          },");
      }
      out.push("        ];");
    }

    out.push("      };");
  }

  out.push("    };");
  out.push("    Views: { [_ in never]: never };");
  out.push("    Functions: { [_ in never]: never };");
  out.push("    Enums: { [_ in never]: never };");
  out.push("    CompositeTypes: { [_ in never]: never };");
  out.push("  };");
  out.push("};");
  out.push("");
  out.push("type PublicSchema = Database['public'];");
  out.push("");
  out.push("export type Tables<T extends keyof PublicSchema['Tables']> =");
  out.push("  PublicSchema['Tables'][T]['Row'];");
  out.push("export type TablesInsert<T extends keyof PublicSchema['Tables']> =");
  out.push("  PublicSchema['Tables'][T]['Insert'];");
  out.push("export type TablesUpdate<T extends keyof PublicSchema['Tables']> =");
  out.push("  PublicSchema['Tables'][T]['Update'];");
  out.push("");

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, out.join("\n"), "utf8");

  console.log(`${OUT} généré — ${tables.size} tables :`);
  console.log("  " + [...tables.keys()].sort().join(", "));
} catch (err) {
  console.error("Erreur :", err.message);
  exit(1);
} finally {
  await client.end().catch(() => {});
}
