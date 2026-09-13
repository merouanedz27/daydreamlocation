-- =============================================================================
-- Gestion de l'équipe : ce que la base garantit toute seule
--
--   node scripts/run-sql.mjs supabase/tests/team.sql
--
-- Trois invariants, et aucun ne peut vivre dans le code applicatif :
--
--   1. Un profil naît `staff` et INACTIF, quoi que raconte le client.
--   2. L'e-mail suit `auth.users`, à la création comme au changement.
--   3. Il reste toujours au moins un administrateur actif.
--
-- Le fichier se termine par un rollback : aucune donnée laissée.
-- =============================================================================

begin;

create temp table test_results (
  step text, attendu text, obtenu text, ok boolean
) on commit drop;

create or replace function pg_temp.check(
  p_step text, p_attendu text, p_obtenu text
) returns void language sql as $$
  insert into test_results values (p_step, p_attendu, p_obtenu, p_attendu is not distinct from p_obtenu);
$$;

/**
 * Crée un compte auth comme le ferait GoTrue. `p_meta` sert à prouver que les
 * métadonnées — qui viennent du CLIENT — n'influencent rien.
 */
create or replace function pg_temp.make_user(p_email text, p_meta jsonb default '{}'::jsonb)
returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change,
    email_change_token_new, email_change_token_current,
    reauthentication_token, phone_change, phone_change_token,
    created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    p_email, 'x', now(), '{}'::jsonb, p_meta,
    '', '', '', '', '', '', '', '', now(), now());
  return v_id;
end $$;

-- =============================================================================
-- 1. Un profil naît `staff` et inactif, même si le client réclame `owner`
--
-- C'est LE test de l'élévation de privilège : la clé publiable est visible dans
-- chaque navigateur, et si l'inscription publique était réactivée, ce jsonb
-- serait exactement ce qu'un inconnu enverrait.
-- =============================================================================
do $$
declare
  v_id uuid;
  v_role text;
  v_active boolean;
  v_email text;
begin
  v_id := pg_temp.make_user('team-meta@daydream.test',
                            '{"role":"owner","full_name":"Intrus"}'::jsonb);

  select role, is_active, email into v_role, v_active, v_email
  from public.profiles where id = v_id;

  perform pg_temp.check('1a. rôle ignoré dans les métadonnées', 'staff', v_role);
  perform pg_temp.check('1b. profil né inactif', 'false', v_active::text);
  perform pg_temp.check('1c. e-mail recopié', 'team-meta@daydream.test', v_email);
end $$;

-- =============================================================================
-- 2. L'e-mail suit son original
--
-- Une copie qui ne se resynchronise pas est pire que pas de copie : la liste
-- d'équipe afficherait un identifiant faux avec aplomb.
-- =============================================================================
do $$
declare
  v_id uuid;
  v_email text;
begin
  v_id := pg_temp.make_user('team-avant@daydream.test');

  update auth.users set email = 'team-apres@daydream.test' where id = v_id;

  select email into v_email from public.profiles where id = v_id;
  perform pg_temp.check('2. changement d''e-mail propagé', 'team-apres@daydream.test', v_email);
end $$;

-- =============================================================================
-- 3. Le dernier administrateur actif ne peut pas disparaître
--
-- Sans ce garde-fou, un administrateur qui se rétrograde laissait la base sans
-- personne pour promouvoir qui que ce soit — irrécupérable sans SQL brut.
-- =============================================================================
do $$
declare
  v_owner uuid;
  v_staff uuid;
  v_msg text;
begin
  -- Base de test vierge d'administrateur : on en fabrique un.
  v_owner := pg_temp.make_user('team-owner1@daydream.test');
  v_staff := pg_temp.make_user('team-staff1@daydream.test');

  -- 3a. Un UPDATE sur un simple membre passe, même sans aucun administrateur
  --     actif en base. C'est la clause `WHEN` qui l'autorise : sans elle, le
  --     tout premier compte créé sur une base vide échouerait.
  begin
    update public.profiles set full_name = 'Membre' where id = v_staff;
    perform pg_temp.check('3a. membre modifiable sans admin en base', 'ok', 'ok');
  exception when others then
    perform pg_temp.check('3a. membre modifiable sans admin en base', 'ok', sqlerrm);
  end;

  update public.profiles set role = 'owner', is_active = true where id = v_owner;
  update public.profiles set is_active = true where id = v_staff;

  -- 3b. Le rétrograder échoue : c'est le dernier.
  begin
    update public.profiles set role = 'staff' where id = v_owner;
    perform pg_temp.check('3b. dernier admin rétrogradé', 'last_active_owner', 'accepté !');
  exception when others then
    get stacked diagnostics v_msg = message_text;
    perform pg_temp.check('3b. dernier admin rétrogradé', 'last_active_owner', v_msg);
  end;

  -- 3c. Le désactiver échoue pour la même raison.
  begin
    update public.profiles set is_active = false where id = v_owner;
    perform pg_temp.check('3c. dernier admin désactivé', 'last_active_owner', 'accepté !');
  exception when others then
    get stacked diagnostics v_msg = message_text;
    perform pg_temp.check('3c. dernier admin désactivé', 'last_active_owner', v_msg);
  end;
end $$;

-- =============================================================================
-- 4. LA RÉGRESSION `security definer`
--
-- Le garde-fou compte les administrateurs actifs. S'il s'exécutait avec les
-- droits de l'APPELANT, ce `select` serait filtré par `profiles_read`
-- (`id = auth.uid() or private.is_owner()`) — or quand un administrateur se
-- rétrograde LUI-MÊME, `private.is_owner()` est déjà faux quand le trigger
-- AFTER s'exécute. Il ne verrait que sa propre ligne, compterait zéro, et
-- refuserait l'opération MÊME AVEC un autre administrateur en base.
--
-- Ce test doit donc tourner SOUS L'IDENTITÉ de l'administrateur, pas en
-- `postgres` : c'est la seule forme qui attrape le bug.
-- =============================================================================
do $$
declare
  v_a uuid;
  v_b uuid;
  v_role text;
  v_msg text;
begin
  v_a := pg_temp.make_user('team-owner-a@daydream.test');
  v_b := pg_temp.make_user('team-owner-b@daydream.test');

  update public.profiles set role = 'owner', is_active = true where id in (v_a, v_b);

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_a::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  begin
    update public.profiles set role = 'staff' where id = v_a;
  exception when others then
    get stacked diagnostics v_msg = message_text;
  end;

  perform set_config('role', 'postgres', true);

  select role into v_role from public.profiles where id = v_a;
  perform pg_temp.check(
    '4. auto-rétrogradation avec un second admin (security definer)',
    'staff', coalesce(v_role || coalesce(' / ' || v_msg, ''), 'introuvable'));
end $$;

-- =============================================================================
-- 5. `id` et `email` ne se modifient pas depuis l'application
-- =============================================================================
do $$
declare
  v_id uuid;
  v_email text;
begin
  v_id := pg_temp.make_user('team-fixe@daydream.test');

  update public.profiles set email = 'menteur@daydream.test' where id = v_id;

  select email into v_email from public.profiles where id = v_id;
  perform pg_temp.check('5. e-mail épinglé', 'team-fixe@daydream.test', v_email);
end $$;

-- =============================================================================
-- 6. Supprimer le compte auth du dernier administrateur n'est PAS bloqué
--
-- Le garde-fou ne porte que sur `update` : le bloquer sur `delete`
-- transformerait un `deleteUser` en erreur 500 opaque et casserait la
-- suppression depuis le dashboard Supabase.
-- =============================================================================
do $$
declare
  v_id uuid;
  n integer;
  v_msg text := 'ok';
begin
  v_id := pg_temp.make_user('team-adieu@daydream.test');
  update public.profiles set role = 'owner', is_active = true where id = v_id;

  begin
    delete from auth.users where id = v_id;
  exception when others then
    get stacked diagnostics v_msg = message_text;
  end;

  select count(*) into n from public.profiles where id = v_id;
  perform pg_temp.check('6. suppression du compte auth non bloquée',
                        'ok / 0', v_msg || ' / ' || n::text);
end $$;

-- --- résultats ---------------------------------------------------------------
select
  case when ok then 'OK  ' else 'ÉCHEC' end as resultat,
  step, attendu, obtenu
from test_results
order by step;

do $$
declare n integer;
begin
  select count(*) into n from test_results where not ok;
  if n > 0 then
    raise exception '% test(s) en échec', n;
  end if;
  raise notice 'Tous les tests passent';
end $$;

rollback;
