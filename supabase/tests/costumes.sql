-- =============================================================================
-- Costumes DIVISIBLES — le pantalon d'un costume, la veste d'un autre
--
--   node scripts/run-sql.mjs supabase/tests/costumes.sql
--
-- Le script s'annule entièrement (rollback) : il ne laisse aucune donnée.
--
-- Ce qu'on vérifie : chaque PARTIE d'un costume se réserve seule, la
-- contrainte EXCLUDE veille sur chacune, et le chiffre d'affaires compte un
-- costume UNE fois, quel que soit le nombre de ses parties.
-- =============================================================================

begin;

create temp table test_results (
  step text, attendu text, obtenu text, ok boolean
) on commit drop;
grant all on test_results to authenticated;

create or replace function pg_temp.make_user(p_email text, p_role text)
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
    p_email, 'x', now(), '{}'::jsonb, '{}'::jsonb,
    '', '', '', '', '', '', '', '', now(), now());
  update public.profiles set role = p_role, is_active = true where id = v_id;
  return v_id;
end $$;

do $$
declare
  v_staff  uuid := pg_temp.make_user('cos-staff@daydream.test', 'staff');
  v_cat    bigint;
  v_model  bigint;
  a_veste  bigint; a_pant bigint;
  b_veste  bigint; b_pant bigint;
  v_cmd    bigint;
  v_msg    text;
  v_snap   text;
  v_ca_before numeric;
  v_ca_after  numeric;
begin
  select id into v_cat from public.categories where slug = 'costume';

  v_ca_before := (public.dashboard_stats() -> 'stockValue' ->> 'total')::numeric;

  insert into public.article_models (ref_code, name_fr, category_id, base_price, purchase_price)
  values ('ZZCOS', 'Costume test', v_cat, 9000, 50000)
  returning id into v_model;
  insert into public.article_model_parts (model_id, part, rent_price, position)
  values (v_model, 'veste', 6000, 1), (v_model, 'pantalon', 3000, 2);

  insert into public.article_units (model_id, ref_code, size, set_ref, part)
  values (v_model, 'ZZCOS-01-V', '50', 'ZZCOS-01', 'veste') returning id into a_veste;
  insert into public.article_units (model_id, ref_code, size, set_ref, part)
  values (v_model, 'ZZCOS-01-P', '48', 'ZZCOS-01', 'pantalon') returning id into a_pant;
  insert into public.article_units (model_id, ref_code, size, set_ref, part)
  values (v_model, 'ZZCOS-02-V', '52', 'ZZCOS-02', 'veste') returning id into b_veste;
  insert into public.article_units (model_id, ref_code, size, set_ref, part)
  values (v_model, 'ZZCOS-02-P', '52', 'ZZCOS-02', 'pantalon') returning id into b_pant;

  -- 1. le chiffre d'affaires compte chaque costume UNE fois (2 × 50 000)
  v_ca_after := (public.dashboard_stats() -> 'stockValue' ->> 'total')::numeric;
  insert into test_results values ('1. CA : un costume compte une fois',
    '100000', (v_ca_after - v_ca_before)::text, v_ca_after - v_ca_before = 100000);

  -- 2. une même partie ne peut pas appartenir deux fois au même costume
  begin
    insert into public.article_units (model_id, ref_code, size, set_ref, part)
    values (v_model, 'ZZCOS-01-V2', '50', 'ZZCOS-01', 'veste');
    v_msg := 'accepté !';
  exception when unique_violation then
    v_msg := 'refusé';
  end;
  insert into test_results values ('2. deux vestes dans un costume refusées', 'refusé', v_msg, v_msg = 'refusé');

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_staff::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  -- 3. commande 1 : le PANTALON du costume A seul
  v_cmd := public.create_order(
    p_customer_name := 'Pantalon seul', p_customer_phone := null,
    p_event_date := '2031-05-10',
    p_lines := jsonb_build_array(jsonb_build_object('unitId', a_pant, 'unitPrice', 3000)));
  select model_name_snapshot into v_snap from public.order_lines where order_id = v_cmd;
  insert into test_results values ('3. partie seule réservée, nommée',
    'Costume test · Pantalon', v_snap, v_snap = 'Costume test · Pantalon');

  -- 4. commande 2, mêmes dates : la VESTE du costume A + le pantalon du B
  begin
    v_cmd := public.create_order(
      p_customer_name := 'Panache', p_customer_phone := null,
      p_event_date := '2031-05-10',
      p_lines := jsonb_build_array(
        jsonb_build_object('unitId', a_veste, 'unitPrice', 6000),
        jsonb_build_object('unitId', b_pant, 'unitPrice', 3000)));
    v_msg := 'acceptée';
  exception when others then
    get stacked diagnostics v_msg = message_text;
  end;
  insert into test_results values ('4. veste de A + pantalon de B, mêmes dates', 'acceptée', v_msg, v_msg = 'acceptée');

  -- 5. commande 3, mêmes dates : le costume A COMPLET — son pantalon est pris
  begin
    v_cmd := public.create_order(
      p_customer_name := 'Complet', p_customer_phone := null,
      p_event_date := '2031-05-10',
      p_lines := jsonb_build_array(
        jsonb_build_object('unitId', a_veste, 'unitPrice', 9000),
        jsonb_build_object('unitId', a_pant, 'unitPrice', 0)));
    v_msg := 'acceptée !';
  exception when others then
    get stacked diagnostics v_msg = message_text;
  end;
  insert into test_results values ('5. costume complet refusé (parties prises)',
    'unit_unavailable:ZZCOS-01-V', v_msg, v_msg = 'unit_unavailable:ZZCOS-01-V');

  -- 6. la veste du costume B, elle, reste libre ces jours-là
  begin
    v_cmd := public.create_order(
      p_customer_name := 'Veste B', p_customer_phone := null,
      p_event_date := '2031-05-10',
      p_lines := jsonb_build_array(jsonb_build_object('unitId', b_veste, 'unitPrice', 6000)));
    v_msg := 'acceptée';
  exception when others then
    get stacked diagnostics v_msg = message_text;
  end;
  insert into test_results values ('6. veste de B encore libre', 'acceptée', v_msg, v_msg = 'acceptée');

  -- 7. un employé lit les parties d'un modèle mais ne les modifie pas
  select count(*)::text into v_msg from public.article_model_parts where model_id = v_model;
  insert into test_results values ('7. employé : lecture des parties', '2', v_msg, v_msg = '2');
  update public.article_model_parts set rent_price = 1 where model_id = v_model;
  select min(rent_price)::text into v_msg from public.article_model_parts where model_id = v_model;
  insert into test_results values ('8. employé : prix des parties intacts', '3000.00', v_msg, v_msg = '3000.00');

  perform set_config('role', 'postgres', true);
end $$;

select case when ok then 'OK  ' else 'ÉCHEC' end as resultat, step, attendu, obtenu
from test_results order by step;

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
