-- =============================================================================
-- NOM AFFICHÉ : chacun change le sien, et rien d'autre.
--
--   node scripts/run-sql.mjs supabase/tests/display_name.sql
--
-- `set_own_full_name` change le nom de l'appelant ; il ne touche ni à son rôle,
-- ni au profil d'un autre ; il refuse un nom trop court. Se termine par un
-- rollback.
-- =============================================================================

begin;

create temp table test_results (
  step text, attendu text, obtenu text, ok boolean
) on commit drop;

do $$
declare
  v_staff uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_failed boolean := false;
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
  from (values (v_staff, 'nametest-staff@daydream.test'),
               (v_other, 'nametest-other@daydream.test')) as u(id, email);

  update public.profiles set role = 'staff', is_active = true, full_name = 'Ancien nom' where id = v_staff;
  update public.profiles set role = 'staff', is_active = true, full_name = 'Collègue' where id = v_other;

  -- Sous l'identité du membre.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_staff::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  perform public.set_own_full_name('  Nouveau nom  ');

  begin
    perform public.set_own_full_name('x');
  exception when others then
    v_failed := true;
  end;

  perform set_config('role', 'postgres', true);

  insert into test_results
  select 'renomme son propre profil (espaces retirés)', 'Nouveau nom', full_name, full_name = 'Nouveau nom'
    from public.profiles where id = v_staff;
  insert into test_results
  select 'son rôle ne change pas', 'staff', role::text, role::text = 'staff'
    from public.profiles where id = v_staff;
  insert into test_results
  select 'le collègue garde son nom', 'Collègue', full_name, full_name = 'Collègue'
    from public.profiles where id = v_other;
  insert into test_results
  values ('nom d''une lettre refusé', 'erreur', case when v_failed then 'erreur' else 'accepté' end, v_failed);
end $$;

select step, attendu, obtenu, case when ok then 'OK' else 'ÉCHEC' end as resultat
from test_results;

do $$
begin
  if exists (select 1 from test_results where not ok) then
    raise exception 'Au moins un test a échoué.';
  end if;
end $$;

rollback;
