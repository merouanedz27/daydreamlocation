#!/usr/bin/env node
/**
 * Crée (ou met à jour) un compte pour l'équipe.
 *
 *   node scripts/create-account.mjs <email> <mot-de-passe> "<Nom complet>" [owner|staff]
 *
 * L'inscription publique est DÉSACTIVÉE sur le projet, et c'est voulu : la clé
 * publiable est visible dans le navigateur, donc un formulaire d'inscription
 * ouvert laisserait n'importe qui se créer un accès. Les comptes sont créés par
 * le propriétaire. Tant qu'il n'existe pas d'écran d'administration, ce script
 * en tient lieu.
 *
 * L'endpoint `/auth/v1/signup` est donc inutilisable, et l'API Admin exigerait
 * la clé secrète. On écrit directement dans `auth.users` et `auth.identities`,
 * avec un mot de passe haché en bcrypt par pgcrypto — exactement ce que fait
 * GoTrue. L'e-mail est confirmé d'office : aucun service d'envoi n'est
 * configuré sur le projet.
 *
 * Le mot de passe n'est ni journalisé ni écrit sur disque : il ne transite que
 * comme paramètre lié de la requête SQL.
 */
import { readFileSync } from "node:fs";
import { argv, env, exit } from "node:process";
import pg from "pg";

const [, , email, password, fullName, role = "staff"] = argv;

if (!email || !password || !fullName) {
  console.error(
    'usage: node scripts/create-account.mjs <email> <mot-de-passe> "<Nom complet>" [owner|staff]',
  );
  exit(2);
}
if (!["owner", "staff"].includes(role)) {
  console.error(`Rôle invalide : ${role} (attendu : owner ou staff)`);
  exit(2);
}
if (password.length < 8) {
  console.error("Mot de passe trop court (8 caractères minimum).");
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

if (!env.SUPABASE_DB_URL) {
  console.error("SUPABASE_DB_URL absent de .env.local.");
  exit(2);
}

const client = new pg.Client({
  connectionString: env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});

// `auth.users` n'a pas de contrainte unique simple sur `email` : l'unicité vient
// d'un index PARTIEL (`users_email_partial_key ... where is_sso_user = false`),
// que `ON CONFLICT` ne peut pas cibler. On fait donc une recherche explicite,
// le tout dans une transaction : soit le compte est complet (utilisateur +
// identité + profil), soit rien n'est écrit. Un utilisateur sans identité ne
// peut pas se connecter et serait pénible à diagnostiquer.

const FIND_USER = `select id from auth.users where email = $1 and is_sso_user = false`;

// Les colonnes de jetons doivent valoir '' et NON NULL : GoTrue les lit dans des
// champs Go de type `string`, qui ne savent pas recevoir NULL. Un compte créé
// avec des NULL s'insère sans erreur, puis la connexion échoue avec un opaque
// « Database error querying schema » — plusieurs minutes de diagnostic pour un
// message qui ne dit rien. On les initialise explicitement.
const EMPTY_TOKEN_COLUMNS = `
    confirmation_token = coalesce(confirmation_token, ''),
    recovery_token = coalesce(recovery_token, ''),
    email_change = coalesce(email_change, ''),
    email_change_token_new = coalesce(email_change_token_new, ''),
    email_change_token_current = coalesce(email_change_token_current, ''),
    reauthentication_token = coalesce(reauthentication_token, ''),
    phone_change = coalesce(phone_change, ''),
    phone_change_token = coalesce(phone_change_token, '')`;

const INSERT_USER = `
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change,
    email_change_token_new, email_change_token_current,
    reauthentication_token, phone_change, phone_change_token,
    created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
    'authenticated', 'authenticated', $1,
    extensions.crypt($2, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', $3::text, 'role', $4::text),
    '', '', '', '', '', '', '', '',
    now(), now()
  ) returning id`;

const UPDATE_USER = `
  update auth.users
     set encrypted_password = extensions.crypt($2, extensions.gen_salt('bf')),
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         raw_user_meta_data = jsonb_build_object('full_name', $3::text, 'role', $4::text),
         updated_at = now(),
         ${EMPTY_TOKEN_COLUMNS}
   where id = $1::uuid returning id`;

const UPSERT_IDENTITY = `
  insert into auth.identities (
    provider_id, user_id, identity_data, provider, created_at, updated_at
  ) values (
    $1::text, $1::uuid,
    jsonb_build_object('sub', $1::text, 'email', $2::text, 'email_verified', true),
    'email', now(), now()
  )
  on conflict (provider, provider_id) do update
     set identity_data = excluded.identity_data, updated_at = now()`;

const UPSERT_PROFILE = `
  insert into public.profiles (id, full_name, role, is_active)
  values ($1::uuid, $2, $3, true)
  on conflict (id) do update
     set full_name = excluded.full_name,
         role      = excluded.role,
         is_active = true
  returning full_name, role, is_active`;

try {
  await client.connect();
  await client.query("begin");

  const existing = await client.query(FIND_USER, [email]);
  let userId;
  let created;

  if (existing.rows.length) {
    userId = existing.rows[0].id;
    await client.query(UPDATE_USER, [userId, password, fullName, role]);
    created = false;
  } else {
    const inserted = await client.query(INSERT_USER, [email, password, fullName, role]);
    userId = inserted.rows[0].id;
    created = true;
  }

  await client.query(UPSERT_IDENTITY, [userId, email]);
  const { rows } = await client.query(UPSERT_PROFILE, [userId, fullName, role]);

  await client.query("commit");

  const p = rows[0];
  console.log(created ? "Compte créé :" : "Compte mis à jour :");
  console.log(`  e-mail : ${email}`);
  console.log(`  nom    : ${p.full_name}`);
  console.log(`  rôle   : ${p.role}`);
  console.log(`  actif  : ${p.is_active}`);
} catch (err) {
  await client.query("rollback").catch(() => {});
  console.error("Erreur :", err.message);
  if (err.detail) console.error("Détail :", err.detail);
  exit(1);
} finally {
  await client.end().catch(() => {});
}
