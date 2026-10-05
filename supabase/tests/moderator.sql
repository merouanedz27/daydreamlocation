-- =============================================================================
-- Rôle MODÉRATEUR : employé + gestion du stock, jamais l'argent.
--
--   node scripts/run-sql.mjs supabase/tests/moderator.sql
--
-- Vérifie qu'il AUTORISE (écrire un modèle, une pièce, lire les commandes) et
-- qu'il BLOQUE (dépenses des autres, réglages) — et qu'un simple employé, lui,
-- n'écrit toujours pas dans le stock. Se termine par un rollback.
-- =============================================================================

begin;

create temp table test_results (
  step text, attendu text, obtenu text, ok boolean
) on commit drop;

do $$
declare
  v_owner uuid := gen_random_uuid();
  v_mod uuid := gen_random_uuid();
  v_staff uuid := gen_random_uuid();
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change,
    email_change_token_new, email_change_token_current,
    reauthentication_token, phone_change, phone_change_token,
    created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
     u.email, 'x', now(), '{}'::jsonb, '{}'::jsonb,
     '', '', '', '', '', '', '', '', now(), now()
  from (values (v_owner, 'modtest-owner@daydream.test'),
               (v_mod, 'modtest-mod@daydream.test'),
               (v_staff, 'modtest-staff@daydream.test')) as u(id, email);

  update public.profiles set role = 'owner', is_active = true, full_name = 'MOD owner' where id = v_owner;
  update public.profiles set role = 'moderator', is_active = true, full_name = 'MOD moderator' where id = v_mod;
  update public.profiles set role = 'staff', is_active = true, full_name = 'MOD staff' where id = v_staff;

  insert into public.expenses (category, amount, description) values ('loyer', 5000, 'MOD TEST');
  insert into public.orders (customer_name, event_date) values ('Client MOD', '2026-09-15');

  create temp table test_ids (owner_id uuid, mod_id uuid, staff_id uuid) on commit drop;
  insert into test_ids values (v_owner, v_mod, v_staff);
end $$;

-- Exécute une requête sous l'identité d'un utilisateur ; rend le nombre de
-- lignes touchées (ou lues), -1 sur ERREUR SQL. Un refus de policy d'écriture
-- ne lève pas toujours d'erreur : il peut filtrer la ligne (0).
create or replace function pg_temp.run_as(p_user uuid, p_sql text)
returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  if p_sql ilike 'select%' then
    execute p_sql into v_count;
  else
    execute p_sql;
    get diagnostics v_count = row_count;
  end if;
  perform set_config('role', 'postgres', true);
  return v_count;
exception when insufficient_privilege then
  perform set_config('role', 'postgres', true);
  return 0;  -- refus RLS sur un insert : « new row violates row-level security »
when others then
  perform set_config('role', 'postgres', true);
  raise notice 'ERREUR: %', sqlerrm;
  return -1;
end $$;

do $$
declare
  v_owner uuid; v_mod uuid; v_staff uuid;
  v_cat bigint;
  n integer;
begin
  select owner_id, mod_id, staff_id into v_owner, v_mod, v_staff from test_ids;
  select id into v_cat from public.categories where slug = 'veste';

  n := pg_temp.run_as(v_mod, format(
    'insert into public.article_models (ref_code, name_fr, category_id, base_price) values (%L, %L, %s, 1000)',
    'MODTEST-1', 'Modele test', v_cat));
  insert into test_results values ('1. moderateur cree un modele', '1', n::text, n = 1);

  n := pg_temp.run_as(v_mod,
    'insert into public.article_units (model_id, ref_code, size)
     select id, ''MODTEST-1-01'', ''50'' from public.article_models where ref_code = ''MODTEST-1''');
  insert into test_results values ('2. moderateur ajoute une piece', '1', n::text, n = 1);

  n := pg_temp.run_as(v_mod,
    'update public.article_units set size = ''52'' where ref_code = ''MODTEST-1-01''');
  insert into test_results values ('3. moderateur modifie la taille', '1', n::text, n = 1);

  n := pg_temp.run_as(v_staff,
    'update public.article_units set size = ''54'' where ref_code = ''MODTEST-1-01''');
  insert into test_results values ('4. employe ne modifie PAS le stock', '0', n::text, n = 0);

  n := pg_temp.run_as(v_staff, format(
    'insert into public.article_models (ref_code, name_fr, category_id, base_price) values (%L, %L, %s, 1000)',
    'MODTEST-2', 'Modele employe', v_cat));
  insert into test_results values ('5. employe ne cree PAS de modele', '0', n::text, n = 0);

  n := pg_temp.run_as(v_mod, 'select count(*) from public.orders');
  insert into test_results values ('6. moderateur lit les commandes', '>= 1', n::text, n >= 1);

  n := pg_temp.run_as(v_mod, 'select count(*) from public.expenses');
  insert into test_results values ('7. moderateur ne lit PAS les depenses', '0', n::text, n = 0);

  n := pg_temp.run_as(v_mod, 'update public.settings set shop_address = ''MOD'' where id');
  insert into test_results values ('8. moderateur ne modifie PAS les reglages', '0', n::text, n = 0);

  n := pg_temp.run_as(v_mod, 'select count(*) from public.profiles');
  insert into test_results values ('9. moderateur ne voit que son profil', '1', n::text, n = 1);

  n := pg_temp.run_as(v_owner,
    'update public.article_units set size = ''56'' where ref_code = ''MODTEST-1-01''');
  insert into test_results values ('10. proprietaire modifie toujours le stock', '1', n::text, n = 1);
end $$;

select case when ok then 'OK  ' else 'ECHEC' end as resultat, step, attendu, obtenu
from test_results order by step;

select count(*) filter (where ok) || '/' || count(*) || ' tests reussis' as bilan,
       case when count(*) filter (where not ok) = 0
            then 'TOUT PASSE' else 'DES TESTS ECHOUENT' end as verdict
from test_results;

rollback;
