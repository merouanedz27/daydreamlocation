-- =============================================================================
-- Vérification des accès RLS
--
--   node scripts/run-sql.mjs supabase/tests/rls.sql
--
-- POURQUOI CE FICHIER EXISTE : le test « RLS activée sur toutes les tables »
-- passait au vert alors que l'application entière renvoyait 403. Vérifier
-- qu'une policy BLOQUE ne suffit pas — il faut vérifier qu'elle AUTORISE les
-- ayants droit. Un `revoke execute` de trop sur les helpers avait rendu toute
-- lecture impossible, propriétaire compris, sans qu'aucun test ne bronche.
--
-- On simule ici ce que fait PostgREST : endosser le rôle `authenticated` et
-- poser `request.jwt.claims`, dont `auth.uid()` extrait le `sub`.
--
-- Le script se termine par un rollback : aucune donnée laissée.
-- =============================================================================

begin;

create temp table test_results (
  step text, attendu text, obtenu text, ok boolean
) on commit drop;

-- --- jeu d'essai : un propriétaire, un employé -------------------------------
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_staff uuid := gen_random_uuid();
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change,
    email_change_token_new, email_change_token_current,
    reauthentication_token, phone_change, phone_change_token,
    created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000', v_owner, 'authenticated', 'authenticated',
     'rlstest-owner@daydream.test', 'x', now(), '{}'::jsonb, '{}'::jsonb,
     '', '', '', '', '', '', '', '', now(), now()),
    ('00000000-0000-0000-0000-000000000000', v_staff, 'authenticated', 'authenticated',
     'rlstest-staff@daydream.test', 'x', now(), '{}'::jsonb, '{}'::jsonb,
     '', '', '', '', '', '', '', '', now(), now());

  -- Le trigger handle_new_user a créé les profils : on fixe les rôles.
  -- `is_active = true` est OBLIGATOIRE depuis 20260913100000_equipe.sql — un
  -- profil naît désormais INACTIF, et `private.is_staff()` refuserait tout.
  -- Le propriétaire EN PREMIER : le garde-fou `profiles_keep_one_active_owner`
  -- interdit de retirer le dernier administrateur actif.
  update public.profiles set role = 'owner', is_active = true, full_name = 'RLS owner' where id = v_owner;
  update public.profiles set role = 'staff', is_active = true, full_name = 'RLS staff' where id = v_staff;

  insert into public.expenses (category, amount, description)
  values ('loyer', 5000, 'RLS TEST');

  insert into public.orders (customer_name, event_date)
  values ('Client RLS', '2026-09-15');

  -- mémorisé pour les blocs suivants
  create temp table test_ids (owner_id uuid, staff_id uuid) on commit drop;
  insert into test_ids values (v_owner, v_staff);
end $$;

-- --- helper : exécuter un comptage sous l'identité d'un utilisateur ----------
create or replace function pg_temp.count_as(p_user uuid, p_table text)
returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  -- `set local` : annulé automatiquement en fin de transaction.
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  execute format('select count(*) from public.%I', p_table) into v_count;

  perform set_config('role', 'postgres', true);
  return v_count;
exception when others then
  perform set_config('role', 'postgres', true);
  -- Un refus de policy renvoie 0 ligne ; une ERREUR (droits manquants sur un
  -- helper, par exemple) est un bug, pas une protection. On la distingue.
  raise notice 'ERREUR sur %: %', p_table, sqlerrm;
  return -1;
end $$;

-- --- helper : modifier les réglages sous l'identité d'un utilisateur ---------
-- Rend le nombre de lignes MODIFIÉES. Une policy d'écriture qui refuse ne lève
-- pas d'erreur : elle filtre la ligne, et l'`update` en touche zéro.
create or replace function pg_temp.update_settings_as(p_user uuid)
returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  update public.settings set shop_address = 'RLS TEST' where id;
  get diagnostics v_count = row_count;

  perform set_config('role', 'postgres', true);
  return v_count;
exception when others then
  perform set_config('role', 'postgres', true);
  raise notice 'ERREUR sur settings: %', sqlerrm;
  return -1;
end $$;

do $$
declare
  v_owner uuid;
  v_staff uuid;
  n integer;
begin
  select owner_id, staff_id into v_owner, v_staff from test_ids;

  -- 1. le propriétaire LIT les dépenses
  n := pg_temp.count_as(v_owner, 'expenses');
  insert into test_results values (
    '1. proprietaire lit les depenses', '>= 1',
    case when n < 0 then 'ERREUR SQL' else n::text end, n >= 1);

  -- 2. l'employé NE LIT PAS les dépenses
  n := pg_temp.count_as(v_staff, 'expenses');
  insert into test_results values (
    '2. employe ne lit PAS les depenses', '0',
    case when n < 0 then 'ERREUR SQL' else n::text end, n = 0);

  -- 3. l'employé LIT les commandes (son métier quotidien)
  n := pg_temp.count_as(v_staff, 'orders');
  insert into test_results values (
    '3. employe lit les commandes', '>= 1',
    case when n < 0 then 'ERREUR SQL' else n::text end, n >= 1);

  -- 4. l'employé LIT le catalogue
  n := pg_temp.count_as(v_staff, 'categories');
  insert into test_results values (
    '4. employe lit le catalogue', '>= 1',
    case when n < 0 then 'ERREUR SQL' else n::text end, n >= 1);

  -- 5. l'employé ne voit QUE son profil
  n := pg_temp.count_as(v_staff, 'profiles');
  insert into test_results values (
    '5. employe ne voit que son profil', '1',
    case when n < 0 then 'ERREUR SQL' else n::text end, n = 1);

  -- 6. le propriétaire voit toute l'équipe
  n := pg_temp.count_as(v_owner, 'profiles');
  insert into test_results values (
    '6. proprietaire voit l equipe', '>= 2',
    case when n < 0 then 'ERREUR SQL' else n::text end, n >= 2);

  -- 7. l'employé LIT les réglages : il imprime des bons, qui portent
  --    l'adresse et les conditions de la boutique
  n := pg_temp.count_as(v_staff, 'settings');
  insert into test_results values (
    '7. employe lit les reglages', '1',
    case when n < 0 then 'ERREUR SQL' else n::text end, n = 1);

  -- 8. l'employé NE MODIFIE PAS les coordonnées de la boutique
  n := pg_temp.update_settings_as(v_staff);
  insert into test_results values (
    '8. employe ne modifie PAS la boutique', '0',
    case when n < 0 then 'ERREUR SQL' else n::text end, n = 0);

  -- 9. le propriétaire les modifie
  n := pg_temp.update_settings_as(v_owner);
  insert into test_results values (
    '9. proprietaire modifie la boutique', '1',
    case when n < 0 then 'ERREUR SQL' else n::text end, n = 1);
end $$;

select case when ok then 'OK  ' else 'ECHEC' end as resultat,
       step, attendu, obtenu
from test_results order by step;

select count(*) filter (where ok) || '/' || count(*) || ' tests reussis' as bilan,
       case when count(*) filter (where not ok) = 0
            then 'TOUT PASSE' else 'DES TESTS ECHOUENT' end as verdict
from test_results;

rollback;
