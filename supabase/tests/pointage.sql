-- =============================================================================
-- Pointage : le permanent coche ses absences, le remplaçant ses présences
-- (jamais le futur, jamais un jour payé, jamais avant son début) et chacun ne
-- voit que ses lignes ; le propriétaire corrige tout jour non payé et paie :
--   permanent  : (jours du calendrier − absences) × prix d'une journée ;
--   remplaçant : présences × prix d'une journée.
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
  v_repl uuid := gen_random_uuid();
  v_today date := (now() at time zone 'Africa/Algiers')::date;
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
    (v_other, 'pointage-other@daydream.test'),
    (v_repl, 'pointage-repl@daydream.test')
  ) as users(id, email);

  update public.profiles set role = 'owner', is_active = true where id = v_owner;
  update public.profiles set role = 'staff', is_active = true where id in (v_staff, v_other, v_repl);
  -- L'employé travaille depuis 10 jours, aujourd'hui compris.
  update public.profiles set work_start_date = v_today - 9 where id = v_staff;
  -- Le remplaçant aussi, mais il n'est payé que les jours qu'il coche.
  update public.profiles
     set work_start_date = v_today - 9, pay_type = 'remplacant'
   where id = v_repl;

  create temp table test_ids (owner_id uuid, staff_id uuid, other_id uuid, repl_id uuid) on commit drop;
  insert into test_ids values (v_owner, v_staff, v_other, v_repl);

  -- L'autre employé était absent aujourd'hui.
  insert into public.absences (user_id, day) values (v_other, v_today);
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
  v_repl uuid;
  v_today date := (now() at time zone 'Africa/Algiers')::date;
  v_start date := v_today - 9;
  v_due integer;
  v_count integer;
  v_amount numeric;
  v_state text;
begin
  select owner_id, staff_id, other_id, repl_id into v_owner, v_staff, v_other, v_repl from test_ids;

  -- L'employé coche son absence du jour (deux fois : sans effet la seconde).
  perform pg_temp.act_as(v_staff);
  perform public.mark_absent(v_today);
  perform public.mark_absent(v_today);
  select count(*) into v_count from public.absences;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('staff coche son absence et ne voit que la sienne', '1', v_count::text, v_count = 1);

  -- Il la retire (mauvais toucher), puis la remet.
  perform pg_temp.act_as(v_staff);
  perform public.unmark_absent(v_today);
  select count(*) into v_count from public.absences;
  perform public.mark_absent(v_today);
  perform set_config('role', 'postgres', true);
  insert into test_results values ('staff retire l''absence du jour', '0', v_count::text, v_count = 0);

  -- Un jour oublié de sa période : il le coche lui-même.
  perform pg_temp.act_as(v_staff);
  perform public.mark_absent(v_today - 2);
  perform set_config('role', 'postgres', true);

  -- Un mauvais toucher sur un jour passé : il le retire lui-même.
  perform pg_temp.act_as(v_staff);
  perform public.mark_absent(v_today - 4);
  perform public.unmark_absent(v_today - 4);
  select count(*) into v_count from public.absences where day = v_today - 4;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('staff retire une absence passée non payée', '0', v_count::text, v_count = 0);

  -- Mais jamais par écriture directe : aucune policy pour l'employé.
  v_state := 'acceptée';
  perform pg_temp.act_as(v_staff);
  begin
    delete from public.absences where user_id = v_staff and day = v_today - 2;
    get diagnostics v_count = row_count;
    if v_count = 0 then v_state := 'refusée'; end if;
  exception when insufficient_privilege then v_state := 'refusée';
  end;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('staff n''efface pas en direct', 'refusée', v_state, v_state = 'refusée');

  v_state := 'acceptée';
  perform pg_temp.act_as(v_staff);
  begin
    insert into public.absences (user_id, day) values (v_staff, v_today - 3);
  exception when insufficient_privilege then v_state := 'refusée';
  end;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('staff n''écrit pas directement', 'refusée', v_state, v_state = 'refusée');

  -- Il ne voit pas les absences des autres.
  perform pg_temp.act_as(v_staff);
  select count(*) into v_count from public.absences where user_id = v_other;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('staff ne voit pas les autres', '0', v_count::text, v_count = 0);

  -- Demain : refusé.
  v_state := 'acceptée';
  perform pg_temp.act_as(v_staff);
  begin
    perform public.mark_absent(v_today + 1);
  exception when sqlstate 'P0003' then v_state := 'P0003';
  end;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('staff ne coche pas demain', 'P0003', v_state, v_state = 'P0003');

  -- La veille de son début : hors période.
  v_state := 'acceptée';
  perform pg_temp.act_as(v_staff);
  begin
    perform public.mark_absent(v_start - 1);
  exception when sqlstate 'P0003' then v_state := 'P0003';
  end;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('staff ne coche pas avant son début', 'P0003', v_state, v_state = 'P0003');

  -- Sans début ni paie : la période part du 1er du mois.
  v_state := 'acceptée';
  perform pg_temp.act_as(v_other);
  begin
    perform public.mark_absent((date_trunc('month', v_today::timestamp) - interval '1 day')::date);
  exception when sqlstate 'P0003' then v_state := 'P0003';
  end;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('sans début : pas avant le 1er du mois', 'P0003', v_state, v_state = 'P0003');

  -- Le propriétaire coche une absence oubliée et voit toute l'équipe.
  perform pg_temp.act_as(v_owner);
  insert into public.absences (user_id, day, marked_by) values (v_staff, v_today - 1, v_owner);
  select count(*) into v_count from public.absences where user_id in (v_staff, v_other);
  perform set_config('role', 'postgres', true);
  insert into test_results values ('owner coche et voit toute l''équipe', '4', v_count::text, v_count = 4);

  -- L'employé ne peut pas se payer.
  v_state := 'acceptée';
  perform pg_temp.act_as(v_staff);
  begin
    perform public.pay_worker(v_staff, 1000, 'x');
  exception when insufficient_privilege then v_state := '42501';
  end;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('staff ne paie pas', '42501', v_state, v_state = '42501');

  -- Paie : 10 jours du calendrier − 3 absences, à 1 500 DA la journée.
  perform pg_temp.act_as(v_owner);
  select p.days, p.amount into v_count, v_amount from public.pay_worker(v_staff, 1500, 'Salaire — test') p;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('paie : calendrier − absences', '7', v_count::text, v_count = 7);
  insert into test_results values ('paie : jours × prix d''une journée', '10500', v_amount::text, v_amount = 10500);

  select count(*) into v_count from public.expenses e
    join public.pay_resets r on r.expense_id = e.id
   where r.user_id = v_staff and e.category = 'salaire' and e.amount = 10500
     and r.daily_rate = 1500 and r.pay_type = 'permanent' and r.absences_count = 3
     and e.description = 'Salaire — test';
  insert into test_results values ('paie ajoutée aux frais (salaire)', '1', v_count::text, v_count = 1);

  select count(*) into v_count from public.profiles where id = v_staff and daily_rate = 1500;
  insert into test_results values ('prix d''une journée gardé sur le profil', '1', v_count::text, v_count = 1);

  -- Payé ce soir : plus rien n'est dû aujourd'hui.
  perform pg_temp.act_as(v_owner);
  select p.days into v_count from public.pay_worker(v_staff, 1500, 'x') p;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('compteur remis à zéro', '0', v_count::text, v_count = 0);

  -- Sans début ni paie : du 1er du mois à aujourd'hui, − 1 absence.
  perform pg_temp.act_as(v_owner);
  select p.days, p.amount into v_count, v_amount from public.pay_worker(v_other, 1000, 'x') p;
  perform set_config('role', 'postgres', true);
  v_due := extract(day from v_today)::integer - 1;
  insert into test_results values ('sans début : jours du mois − 1 absence', v_due::text, v_count::text, v_count = v_due);
  insert into test_results values ('sans début : × 1 000', (v_due * 1000)::text, v_amount::text, v_amount = v_due * 1000);

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
    perform public.unmark_absent(v_today - 2);
  exception when sqlstate 'P0001' then v_state := 'P0001';
  end;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('jour payé : staff bloqué', 'P0001', v_state, v_state = 'P0001');

  v_state := 'acceptée';
  perform pg_temp.act_as(v_owner);
  begin
    delete from public.absences where user_id = v_staff and day = v_today - 2;
  exception when sqlstate 'P0001' then v_state := 'P0001';
  end;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('jour payé : owner n''efface pas', 'P0001', v_state, v_state = 'P0001');

  v_state := 'acceptée';
  perform pg_temp.act_as(v_owner);
  begin
    insert into public.absences (user_id, day) values (v_staff, v_today - 5);
  exception when sqlstate 'P0001' then v_state := 'P0001';
  end;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('jour payé : owner ne coche pas', 'P0001', v_state, v_state = 'P0001');

  -- L'historique de paie : visible par l'employé, pas par les autres.
  perform pg_temp.act_as(v_staff);
  select count(*) into v_count from public.pay_resets where user_id = v_staff;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('staff voit ses paies', '2', v_count::text, v_count = 2);

  perform pg_temp.act_as(v_other);
  select count(*) into v_count from public.pay_resets where user_id = v_staff;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('autre employé ne les voit pas', '0', v_count::text, v_count = 0);

  -- --- Remplaçant : il coche ses PRÉSENCES -----------------------------------
  v_state := 'acceptée';
  perform pg_temp.act_as(v_repl);
  begin
    perform public.mark_absent(v_today);
  exception when sqlstate 'P0004' then v_state := 'P0004';
  end;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('remplaçant : pas d''absence', 'P0004', v_state, v_state = 'P0004');

  v_state := 'acceptée';
  perform pg_temp.act_as(v_other);
  begin
    perform public.mark_present(v_today);
  exception when sqlstate 'P0004' then v_state := 'P0004';
  end;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('permanent : pas de présence', 'P0004', v_state, v_state = 'P0004');

  perform pg_temp.act_as(v_repl);
  perform public.mark_present(v_today);
  perform public.mark_present(v_today);
  perform public.mark_present(v_today - 3);
  perform public.mark_present(v_today - 5);
  perform public.mark_present(v_today - 6);
  perform public.unmark_present(v_today - 6);
  select count(*) into v_count from public.presences;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('remplaçant coche, décoche, ne voit que les siennes', '3', v_count::text, v_count = 3);

  v_state := 'acceptée';
  perform pg_temp.act_as(v_repl);
  begin
    perform public.mark_present(v_today + 1);
  exception when sqlstate 'P0003' then v_state := 'P0003';
  end;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('remplaçant : pas demain', 'P0003', v_state, v_state = 'P0003');

  v_state := 'acceptée';
  perform pg_temp.act_as(v_repl);
  begin
    insert into public.presences (user_id, day) values (v_repl, v_today - 1);
  exception when insufficient_privilege then v_state := 'refusée';
  end;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('remplaçant n''écrit pas directement', 'refusée', v_state, v_state = 'refusée');

  -- Le propriétaire ajoute un jour oublié : 4 présences × 2 000 DA.
  perform pg_temp.act_as(v_owner);
  insert into public.presences (user_id, day, marked_by) values (v_repl, v_today - 8, v_owner);
  select p.days, p.amount into v_count, v_amount from public.pay_worker(v_repl, 2000, 'x') p;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('remplaçant : présences', '4', v_count::text, v_count = 4);
  insert into test_results values ('remplaçant : présences × prix', '8000', v_amount::text, v_amount = 8000);

  select count(*) into v_count from public.pay_resets
   where user_id = v_repl and pay_type = 'remplacant' and presences_count = 4 and absences_count is null;
  insert into test_results values ('remplaçant : historique de paie', '1', v_count::text, v_count = 1);

  v_state := 'acceptée';
  perform pg_temp.act_as(v_repl);
  begin
    perform public.unmark_present(v_today - 3);
  exception when sqlstate 'P0001' then v_state := 'P0001';
  end;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('présence payée : remplaçant bloqué', 'P0001', v_state, v_state = 'P0001');

  v_state := 'acceptée';
  perform pg_temp.act_as(v_owner);
  begin
    delete from public.presences where user_id = v_repl and day = v_today - 3;
  exception when sqlstate 'P0001' then v_state := 'P0001';
  end;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('présence payée : owner n''efface pas', 'P0001', v_state, v_state = 'P0001');
end $$;

select case when ok then 'OK  ' else 'ECHEC' end as resultat, step, attendu, obtenu
from test_results order by step;

select count(*) filter (where ok) || '/' || count(*) as bilan,
       case when count(*) filter (where not ok) = 0
            then 'TOUT PASSE' else 'DES TESTS ECHOUENT' end as verdict
from test_results;

rollback;
