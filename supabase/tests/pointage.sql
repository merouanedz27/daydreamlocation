-- =============================================================================
-- Pointage : l'heure vient du serveur, une seule ligne par personne et par
-- jour, un employé ne voit que la sienne, le propriétaire corrige tout.
--
--   node scripts/run-sql.mjs supabase/tests/pointage.sql
--
-- Le test se termine par rollback.
-- =============================================================================

begin;

create temp table test_results (
  step text, attendu text, obtenu text, ok boolean
) on commit drop;

do $$
declare
  v_owner uuid := gen_random_uuid();
  v_staff uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change,
    email_change_token_new, email_change_token_current,
    reauthentication_token, phone_change, phone_change_token,
    created_at, updated_at
  )
  select
    '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated',
    email, 'x', now(), '{}'::jsonb, '{}'::jsonb, '', '', '', '', '', '', '', '', now(), now()
  from (values
    (v_owner, 'pointage-owner@daydream.test'),
    (v_staff, 'pointage-staff@daydream.test'),
    (v_other, 'pointage-other@daydream.test')
  ) as users(id, email);

  update public.profiles set role = 'owner', is_active = true where id = v_owner;
  update public.profiles set role = 'staff', is_active = true where id in (v_staff, v_other);

  create temp table test_ids (owner_id uuid, staff_id uuid, other_id uuid) on commit drop;
  insert into test_ids values (v_owner, v_staff, v_other);

  -- Une période close de la veille pour l'autre employé.
  insert into public.work_shifts (user_id, clock_in, clock_out)
  values (v_other, now() - interval '1 day 8 hours', now() - interval '1 day');
end $$;

create or replace function pg_temp.act_as(p_user uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', p_user::text, 'role', 'authenticated'
  )::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

do $$
declare
  v_owner uuid;
  v_staff uuid;
  v_other uuid;
  v_count integer;
  v_state text;
begin
  select owner_id, staff_id, other_id into v_owner, v_staff, v_other from test_ids;

  -- Arrivée par la fonction : acceptée.
  perform pg_temp.act_as(v_staff);
  perform public.clock_in();
  select count(*) into v_count from public.work_shifts;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('staff pointe son arrivée et ne voit que la sienne', '1', v_count::text, v_count = 1);

  -- Deuxième arrivée le même jour : refusée.
  v_state := 'aucune';
  perform pg_temp.act_as(v_staff);
  begin
    perform public.clock_in();
  exception when sqlstate 'P0001' then v_state := 'P0001';
  end;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('double arrivée refusée', 'P0001', v_state, v_state = 'P0001');

  -- Écriture directe : aucune policy pour l'employé.
  v_state := 'acceptée';
  perform pg_temp.act_as(v_staff);
  begin
    insert into public.work_shifts (user_id, clock_in, clock_out)
    values (v_staff, now() - interval '3 days', now() - interval '2 days');
  exception when insufficient_privilege then v_state := 'refusée';
  end;
  update public.work_shifts set clock_in = clock_in - interval '5 hours' where user_id = v_staff;
  get diagnostics v_count = row_count;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('staff n''insère pas à la main', 'refusée', v_state, v_state = 'refusée');
  insert into test_results values ('staff ne modifie pas ses heures', '0', v_count::text, v_count = 0);

  -- Départ (now() est figé dans la transaction : on recule l'arrivée).
  update public.work_shifts set clock_in = clock_in - interval '1 minute'
   where user_id = v_staff and clock_out is null;
  perform pg_temp.act_as(v_staff);
  perform public.clock_out();
  perform set_config('role', 'postgres', true);
  select count(*) into v_count from public.work_shifts where user_id = v_staff and clock_out is not null;
  insert into test_results values ('staff pointe son départ', '1', v_count::text, v_count = 1);

  -- Départ sans arrivée : refusé.
  v_state := 'aucune';
  perform pg_temp.act_as(v_staff);
  begin
    perform public.clock_out();
  exception when sqlstate 'P0002' then v_state := 'P0002';
  end;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('départ sans arrivée refusé', 'P0002', v_state, v_state = 'P0002');

  -- Journée finie : pas de nouvelle arrivée avant demain.
  v_state := 'aucune';
  perform pg_temp.act_as(v_staff);
  begin
    perform public.clock_in();
  exception when sqlstate 'P0001' then v_state := 'P0001';
  end;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('arrivée après le départ refusée', 'P0001', v_state, v_state = 'P0001');

  -- Le propriétaire voit tout et corrige.
  perform pg_temp.act_as(v_owner);
  select count(*) into v_count from public.work_shifts where user_id in (v_staff, v_other);
  perform set_config('role', 'postgres', true);
  insert into test_results values ('owner voit toute l''équipe', '2', v_count::text, v_count = 2);

  perform pg_temp.act_as(v_owner);
  insert into public.work_shifts (user_id, clock_in, clock_out, corrected_by, corrected_at)
  values (v_staff, now() - interval '3 days 8 hours', now() - interval '3 days', v_owner, now());
  get diagnostics v_count = row_count;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('owner ajoute un pointage oublié', '1', v_count::text, v_count = 1);

  -- Deuxième ligne le même jour : refusée, même pour le propriétaire.
  v_state := 'acceptée';
  perform pg_temp.act_as(v_owner);
  begin
    insert into public.work_shifts (user_id, clock_in, clock_out)
    select v_staff, clock_out + interval '1 minute', clock_out + interval '2 minutes'
      from public.work_shifts
     where user_id = v_staff and corrected_by = v_owner;
  exception when unique_violation then v_state := '23505';
  end;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('un seul pointage par jour', '23505', v_state, v_state = '23505');

  -- Départ oublié la veille : l'arrivée du jour est refusée (chevauchement).
  insert into public.work_shifts (user_id, clock_in) values (v_owner, now() - interval '30 hours');
  v_state := 'acceptée';
  perform pg_temp.act_as(v_owner);
  begin
    perform public.clock_in();
  exception when exclusion_violation then v_state := '23P01';
  end;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('période de la veille encore ouverte', '23P01', v_state, v_state = '23P01');

  -- Un autre employé ne voit rien du premier.
  perform pg_temp.act_as(v_other);
  select count(*) into v_count from public.work_shifts where user_id = v_staff;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('staff ne voit pas les autres', '0', v_count::text, v_count = 0);

  -- Le jour compte à l'heure d'Alger.
  insert into public.work_shifts (user_id, clock_in, clock_out)
  values (v_other, '2026-01-14 23:30:00+00', '2026-01-15 07:00:00+00');
  select count(*) into v_count from public.work_shifts
   where user_id = v_other and work_date = date '2026-01-15';
  insert into test_results values ('work_date à l''heure d''Alger', '1', v_count::text, v_count = 1);
end $$;

select case when ok then 'OK  ' else 'ECHEC' end as resultat, step, attendu, obtenu
from test_results order by step;

select count(*) filter (where ok) || '/' || count(*) as bilan,
       case when count(*) filter (where not ok) = 0
            then 'TOUT PASSE' else 'DES TESTS ECHOUENT' end as verdict
from test_results;

rollback;
