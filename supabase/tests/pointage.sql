-- =============================================================================
-- Pointage par cases (matin / après-midi) : l'employé coche un service de sa
-- période (jamais le futur, jamais un jour payé), ne voit que ses cases ; le
-- propriétaire coche tout jour non payé et remet à zéro à la paie. Chaque
-- service coché compte un jour.
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

  -- L'autre employé a coché hier.
  insert into public.attendance (user_id, day)
  values (v_other, (now() at time zone 'Africa/Algiers')::date - 1);
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
  v_today date := (now() at time zone 'Africa/Algiers')::date;
  v_count integer;
  v_state text;
begin
  select owner_id, staff_id, other_id into v_owner, v_staff, v_other from test_ids;

  -- L'employé coche aujourd'hui (deux fois : sans effet la seconde).
  perform pg_temp.act_as(v_staff);
  perform public.mark_day(v_today, 'matin');
  perform public.mark_day(v_today, 'matin');
  select count(*) into v_count from public.attendance;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('staff coche le jour et ne voit que sa case', '1', v_count::text, v_count = 1);

  -- Il décoche (erreur de toucher), puis recoche.
  perform pg_temp.act_as(v_staff);
  perform public.unmark_today('matin');
  select count(*) into v_count from public.attendance;
  perform public.mark_day(v_today, 'matin');
  perform set_config('role', 'postgres', true);
  insert into test_results values ('staff décoche le jour', '0', v_count::text, v_count = 0);

  -- Matin ET après-midi : deux cases, deux jours.
  perform pg_temp.act_as(v_staff);
  perform public.mark_day(v_today, 'apres_midi');
  select count(*) into v_count from public.attendance where day = v_today;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('matin et après-midi : deux cases', '2', v_count::text, v_count = 2);

  v_state := 'acceptée';
  perform pg_temp.act_as(v_staff);
  begin
    perform public.mark_day(v_today, 'soir');
  exception when sqlstate '22023' then v_state := '22023';
  end;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('service inconnu refusé', '22023', v_state, v_state = '22023');

  -- Un autre jour, à la main : aucune policy pour l'employé.
  v_state := 'acceptée';
  perform pg_temp.act_as(v_staff);
  begin
    insert into public.attendance (user_id, day) values (v_staff, v_today - 3);
  exception when insufficient_privilege then v_state := 'refusée';
  end;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('staff ne coche pas un autre jour', 'refusée', v_state, v_state = 'refusée');

  -- Il ne voit pas les cases des autres.
  perform pg_temp.act_as(v_staff);
  select count(*) into v_count from public.attendance where user_id = v_other;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('staff ne voit pas les autres', '0', v_count::text, v_count = 0);

  -- Un jour futur : refusé.
  v_state := 'acceptée';
  perform pg_temp.act_as(v_staff);
  begin
    perform public.mark_day(v_today + 1, 'matin');
  exception when sqlstate 'P0003' then v_state := 'P0003';
  end;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('staff ne coche pas demain', 'P0003', v_state, v_state = 'P0003');

  -- Le mois dernier, sans paie : hors période.
  v_state := 'acceptée';
  perform pg_temp.act_as(v_staff);
  begin
    perform public.mark_day((date_trunc('month', v_today) - interval '1 day')::date, 'matin');
  exception when sqlstate 'P0003' then v_state := 'P0003';
  end;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('staff ne coche pas avant sa période', 'P0003', v_state, v_state = 'P0003');

  -- Hier, oublié : l'employé le coche lui-même (si hier est dans le mois),
  -- sinon le propriétaire.
  if v_today - 1 >= date_trunc('month', v_today)::date then
    perform pg_temp.act_as(v_staff);
    perform public.mark_day(v_today - 1, 'apres_midi');
    perform set_config('role', 'postgres', true);
  else
    insert into public.attendance (user_id, day, shift) values (v_staff, v_today - 1, 'apres_midi');
  end if;
  select count(*) into v_count from public.attendance where user_id = v_staff and day = v_today - 1;
  insert into test_results values ('jour oublié coché', '1', v_count::text, v_count = 1);

  -- Le propriétaire coche un autre jour oublié.
  perform pg_temp.act_as(v_owner);
  insert into public.attendance (user_id, day, marked_by)
  values (v_staff, v_today - 2, v_owner);
  select count(*) into v_count from public.attendance where user_id in (v_staff, v_other);
  perform set_config('role', 'postgres', true);
  insert into test_results values ('owner coche et voit toute l''équipe', '5', v_count::text, v_count = 5);

  -- L'employé ne peut pas se payer.
  v_state := 'acceptée';
  perform pg_temp.act_as(v_staff);
  begin
    perform public.pay_worker(v_staff, 1000, 'x');
  exception when insufficient_privilege then v_state := '42501';
  end;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('staff ne paie pas', '42501', v_state, v_state = '42501');

  -- Paie : 4 cases × 1 500 DA, puis compteur à zéro.
  perform pg_temp.act_as(v_owner);
  select p.days into v_count from public.pay_worker(v_staff, 1500, 'Salaire — test') p;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('paie : chaque service compte un jour', '4', v_count::text, v_count = 4);

  select count(*) into v_count from public.attendance
   where user_id = v_staff
     and day > (select max(paid_through) from public.pay_resets where user_id = v_staff);
  insert into test_results values ('compteur remis à zéro', '0', v_count::text, v_count = 0);

  -- La paie est entrée dans les frais : 6 000 DA, catégorie salaire.
  select count(*) into v_count from public.expenses e
    join public.pay_resets r on r.expense_id = e.id
   where r.user_id = v_staff and e.category = 'salaire' and e.amount = 6000
     and r.amount = 6000 and r.daily_rate = 1500 and e.description = 'Salaire — test';
  insert into test_results values ('paie ajoutée aux frais (salaire)', '1', v_count::text, v_count = 1);

  -- L'autre employé, payé à 0 DA : pas de dépense vide dans les frais.
  perform pg_temp.act_as(v_owner);
  perform public.pay_worker(v_other, 0, 'Salaire — zéro');
  perform set_config('role', 'postgres', true);
  select count(*) into v_count from public.pay_resets where user_id = v_other and expense_id is null;
  insert into test_results values ('paie à 0 DA : aucune dépense', '1', v_count::text, v_count = 1);

  -- Prix négatif refusé.
  v_state := 'acceptée';
  perform pg_temp.act_as(v_owner);
  begin
    perform public.pay_worker(v_other, -5, 'x');
  exception when sqlstate '22023' then v_state := '22023';
  end;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('prix négatif refusé', '22023', v_state, v_state = '22023');

  -- Le jour payé est fermé : ni l'employé ni le propriétaire n'y touchent.
  v_state := 'acceptée';
  perform pg_temp.act_as(v_staff);
  begin
    perform public.mark_day(v_today - 4, 'matin');
  exception when sqlstate 'P0001' then v_state := 'P0001';
  end;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('jour payé : staff ne le coche pas', 'P0001', v_state, v_state = 'P0001');

  v_state := 'acceptée';
  perform pg_temp.act_as(v_staff);
  begin
    perform public.unmark_today('matin');
  exception when sqlstate 'P0001' then v_state := 'P0001';
  end;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('jour payé : staff bloqué', 'P0001', v_state, v_state = 'P0001');

  v_state := 'acceptée';
  perform pg_temp.act_as(v_owner);
  begin
    insert into public.attendance (user_id, day) values (v_staff, v_today - 5);
  exception when sqlstate 'P0001' then v_state := 'P0001';
  end;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('jour payé : owner bloqué', 'P0001', v_state, v_state = 'P0001');

  -- L'historique de paie : visible par l'employé, pas par les autres.
  perform pg_temp.act_as(v_staff);
  select count(*) into v_count from public.pay_resets where user_id = v_staff;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('staff voit sa paie', '1', v_count::text, v_count = 1);

  perform pg_temp.act_as(v_other);
  select count(*) into v_count from public.pay_resets where user_id = v_staff;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('autre employé ne la voit pas', '0', v_count::text, v_count = 0);
end $$;

select case when ok then 'OK  ' else 'ECHEC' end as resultat, step, attendu, obtenu
from test_results order by step;

select count(*) filter (where ok) || '/' || count(*) as bilan,
       case when count(*) filter (where not ok) = 0
            then 'TOUT PASSE' else 'DES TESTS ECHOUENT' end as verdict
from test_results;

rollback;
