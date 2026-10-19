-- =============================================================================
-- Pointage par absences : l'employé coche une absence de sa période (jamais
-- le futur, jamais un jour payé, jamais avant son début), ne voit que ses
-- lignes ; le propriétaire corrige tout jour non payé et paie :
--   salaire ÷ N × (jours dus − absences), un mois entier valant N jours.
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
    (v_other, 'pointage-other@daydream.test')
  ) as users(id, email);

  update public.profiles set role = 'owner', is_active = true where id = v_owner;
  update public.profiles set role = 'staff', is_active = true where id in (v_staff, v_other);
  -- L'employé travaille depuis le 1er du mois dernier : un mois entier, puis
  -- le mois en cours jusqu'à aujourd'hui.
  update public.profiles
     set work_start_date = (date_trunc('month', v_today::timestamp) - interval '1 month')::date
   where id = v_staff;
  update public.settings set pay_month_days = 30 where id;

  create temp table test_ids (owner_id uuid, staff_id uuid, other_id uuid) on commit drop;
  insert into test_ids values (v_owner, v_staff, v_other);

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

-- --- Jours dus : mêmes exemples que scripts/test-pointage.mjs -----------------
insert into test_results
select label, expected::text, got::text, expected = got
from (values
  ('days_due octobre entier → 30',      private.days_due('2026-10-01', '2026-10-31', 30), 30),
  ('days_due février entier → 30',      private.days_due('2026-02-01', '2026-02-28', 30), 30),
  ('days_due 15 → 31 octobre → 17',     private.days_due('2026-10-15', '2026-10-31', 30), 17),
  ('days_due 15 sept → 31 oct → 46',    private.days_due('2026-09-15', '2026-10-31', 30), 46),
  ('days_due 1er → 20 octobre → 20',    private.days_due('2026-10-01', '2026-10-20', 30), 20),
  ('days_due début après fin → 0',      private.days_due('2026-10-21', '2026-10-20', 30), 0),
  ('days_due à cheval sur l''année',    private.days_due('2026-12-20', '2027-01-10', 30), 22),
  ('days_due N=28 octobre → 28',        private.days_due('2026-10-01', '2026-10-31', 28), 28),
  ('days_due N=28 1er → 30 oct → 28',   private.days_due('2026-10-01', '2026-10-30', 28), 28),
  ('days_due N=28 trois mois → 84',     private.days_due('2026-08-01', '2026-10-31', 28), 84)
) as t(label, got, expected);

do $$
declare
  v_owner uuid;
  v_staff uuid;
  v_other uuid;
  v_today date := (now() at time zone 'Africa/Algiers')::date;
  v_start date := (date_trunc('month', v_today::timestamp) - interval '1 month')::date;
  v_due integer;
  v_count integer;
  v_amount numeric;
  v_state text;
begin
  select owner_id, staff_id, other_id into v_owner, v_staff, v_other from test_ids;

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
    perform public.pay_worker(v_staff, 30000, 'x');
  exception when insufficient_privilege then v_state := '42501';
  end;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('staff ne paie pas', '42501', v_state, v_state = '42501');

  -- Paie : mois dernier entier (30) + mois en cours (jours réels, au plus
  -- 30), moins 3 absences ; 30 000 DA ÷ 30 = 1 000 DA la journée.
  v_due := 30 + least(extract(day from v_today)::integer, 30);
  perform pg_temp.act_as(v_owner);
  select p.days, p.amount into v_count, v_amount from public.pay_worker(v_staff, 30000, 'Salaire — test') p;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('paie : jours dus − absences', (v_due - 3)::text, v_count::text, v_count = v_due - 3);
  insert into test_results values ('paie : salaire ÷ 30 × jours', ((v_due - 3) * 1000)::text, v_amount::text, v_amount = (v_due - 3) * 1000);

  select count(*) into v_count from public.expenses e
    join public.pay_resets r on r.expense_id = e.id
   where r.user_id = v_staff and e.category = 'salaire' and e.amount = (v_due - 3) * 1000
     and r.monthly_salary = 30000 and r.month_days = 30 and r.absences_count = 3
     and e.description = 'Salaire — test';
  insert into test_results values ('paie ajoutée aux frais (salaire)', '1', v_count::text, v_count = 1);

  -- Payé ce soir : plus rien n'est dû aujourd'hui.
  perform pg_temp.act_as(v_owner);
  select p.days into v_count from public.pay_worker(v_staff, 30000, 'x') p;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('compteur remis à zéro', '0', v_count::text, v_count = 0);

  -- Le mois de paie configurable : N = 28.
  update public.settings set pay_month_days = 28 where id;
  perform pg_temp.act_as(v_owner);
  select p.days, p.amount into v_count, v_amount from public.pay_worker(v_other, 28000, 'x') p;
  perform set_config('role', 'postgres', true);
  v_due := least(extract(day from v_today)::integer, 28) - 1;
  insert into test_results values ('N=28 : jours du mois en cours − 1 absence', v_due::text, v_count::text, v_count = v_due);
  insert into test_results values ('N=28 : 28 000 ÷ 28 × jours', (v_due * 1000)::text, v_amount::text, v_amount = v_due * 1000);

  -- Salaire négatif refusé.
  v_state := 'acceptée';
  perform pg_temp.act_as(v_owner);
  begin
    perform public.pay_worker(v_other, -5, 'x');
  exception when sqlstate '22023' then v_state := '22023';
  end;
  perform set_config('role', 'postgres', true);
  insert into test_results values ('salaire négatif refusé', '22023', v_state, v_state = '22023');

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
end $$;

select case when ok then 'OK  ' else 'ECHEC' end as resultat, step, attendu, obtenu
from test_results order by step;

select count(*) filter (where ok) || '/' || count(*) as bilan,
       case when count(*) filter (where not ok) = 0
            then 'TOUT PASSE' else 'DES TESTS ECHOUENT' end as verdict
from test_results;

rollback;
