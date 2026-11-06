-- =============================================================================
-- Comptes de TEST — base locale (Docker) UNIQUEMENT
--
-- Chargé après `seed.sql` par `npm run db:start` / `npm run db:reset`
-- (config.toml > [db.seed]). Jamais par `db:push:prod` : la CLI ne seede pas
-- une base distante.
--
--   owner@daydream.local  /  daydream-local   (propriétaire : tout)
--   staff@daydream.local  /  daydream-local   (équipe)
--   tailleur@daydream.local / daydream-local  (tailleur : l'atelier seul)
--
-- Même écriture que scripts/create-account.mjs : utilisateur + identité +
-- profil, colonnes de jetons à '' (GoTrue refuse NULL), e-mail confirmé.
-- =============================================================================

with accounts (id, email, full_name, role) as (
  values
    ('00000000-0000-4000-8000-000000000001'::uuid, 'owner@daydream.local', 'Propriétaire (test)', 'owner'),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'staff@daydream.local', 'Équipe (test)', 'staff'),
    ('00000000-0000-4000-8000-000000000003'::uuid, 'tailleur@daydream.local', 'Tailleur (test)', 'tailleur')
),
users as (
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change,
    email_change_token_new, email_change_token_current,
    reauthentication_token, phone_change, phone_change_token,
    created_at, updated_at
  )
  select
    '00000000-0000-0000-0000-000000000000', a.id, 'authenticated', 'authenticated', a.email,
    extensions.crypt('daydream-local', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', a.full_name),
    '', '', '', '', '', '', '', '',
    now(), now()
  from accounts a
  on conflict (id) do nothing
  returning id
)
insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
select a.id::text, a.id,
       jsonb_build_object('sub', a.id::text, 'email', a.email, 'email_verified', true),
       'email', now(), now()
from accounts a
on conflict (provider, provider_id) do nothing;

-- Le rôle est posé ICI, jamais lu depuis les métadonnées (voir create-account.mjs).
insert into public.profiles (id, full_name, role, is_active)
values
  ('00000000-0000-4000-8000-000000000001', 'Propriétaire (test)', 'owner', true),
  ('00000000-0000-4000-8000-000000000002', 'Équipe (test)', 'staff', true),
  ('00000000-0000-4000-8000-000000000003', 'Tailleur (test)', 'tailleur', true)
on conflict (id) do update
   set full_name = excluded.full_name, role = excluded.role, is_active = true;
