-- =============================================================================
-- Vérification de `save_ensemble` — créer / modifier un ensemble d'un bloc
--
--   node scripts/run-sql.mjs supabase/tests/ensembles.sql
--
-- Le script s'annule entièrement (rollback) : il ne laisse aucune donnée.
--
-- Les appels tournent SOUS L'IDENTITÉ d'un propriétaire puis d'un employé
-- (`role authenticated` + `request.jwt.claims`), pas en `postgres` : la
-- fonction est `security invoker`, c'est donc RLS qui doit trancher.
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
  v_owner uuid := pg_temp.make_user('ens-owner@daydream.test', 'owner');
  v_staff uuid := pg_temp.make_user('ens-staff@daydream.test', 'staff');
  v_cat   bigint;
  v_model bigint;
  u1 bigint; u2 bigint; u3 bigint; u_retired bigint;
  v_ens   bigint;
  v_items text;
  v_name  text;
  v_msg   text;
begin
  select id into v_cat from public.categories where slug = 'veste';

  insert into public.article_models (ref_code, name_fr, category_id, base_price)
  values ('ZZENS', 'Modele ensemble', v_cat, 1000)
  returning id into v_model;

  insert into public.article_units (model_id, ref_code, size) values (v_model, 'ZZENS-01', '50') returning id into u1;
  insert into public.article_units (model_id, ref_code, size) values (v_model, 'ZZENS-02', '52') returning id into u2;
  insert into public.article_units (model_id, ref_code, size) values (v_model, 'ZZENS-03', '54') returning id into u3;
  insert into public.article_units (model_id, ref_code, size, status)
  values (v_model, 'ZZENS-04', '56', 'retire') returning id into u_retired;

  -- ---------------------------------------------------------------- propriétaire
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  -- 1. création
  v_ens := public.save_ensemble(null, '  Costume n°12  ', null, 15000, array[u1, u2]);
  select name, (select string_agg(unit_id::text, ',' order by unit_id)
                  from public.ensemble_items where ensemble_id = v_ens)
    into v_name, v_items
    from public.ensembles where id = v_ens;
  insert into test_results values ('1. création : nom nettoyé + 2 pièces',
    'Costume n°12 / ' || u1 || ',' || u2, v_name || ' / ' || v_items,
    v_name = 'Costume n°12' and v_items = u1 || ',' || u2);

  -- 2. modification : u1 retirée, u3 ajoutée, u2 gardée ; doublon toléré
  perform public.save_ensemble(v_ens, 'Costume n°12 bis', 'veste + pantalon', null, array[u2, u3, u3]);
  select name, (select string_agg(unit_id::text, ',' order by unit_id)
                  from public.ensemble_items where ensemble_id = v_ens)
    into v_name, v_items
    from public.ensembles where id = v_ens;
  insert into test_results values ('2. modification : liste remplacée',
    'Costume n°12 bis / ' || u2 || ',' || u3, v_name || ' / ' || v_items,
    v_name = 'Costume n°12 bis' and v_items = u2 || ',' || u3);

  -- 3. aucune pièce : refus, et RIEN n'a changé (atomicité)
  begin
    perform public.save_ensemble(v_ens, 'Vide', null, null, '{}'::bigint[]);
    v_msg := 'accepté !';
  exception when others then
    get stacked diagnostics v_msg = message_text;
  end;
  select name into v_name from public.ensembles where id = v_ens;
  insert into test_results values ('3. sans pièce refusé, ensemble intact',
    'ensemble_units_required / Costume n°12 bis', v_msg || ' / ' || v_name,
    v_msg = 'ensemble_units_required' and v_name = 'Costume n°12 bis');

  -- 4. pièce retirée du stock : refus, liste intacte
  begin
    perform public.save_ensemble(v_ens, 'Costume n°12 bis', null, null, array[u2, u_retired]);
    v_msg := 'accepté !';
  exception when others then
    get stacked diagnostics v_msg = message_text;
  end;
  select string_agg(unit_id::text, ',' order by unit_id) into v_items
    from public.ensemble_items where ensemble_id = v_ens;
  insert into test_results values ('4. pièce retirée refusée, liste intacte',
    'ensemble_unit_invalid / ' || u2 || ',' || u3, v_msg || ' / ' || v_items,
    v_msg = 'ensemble_unit_invalid' and v_items = u2 || ',' || u3);

  -- 5. nom vide
  begin
    perform public.save_ensemble(null, '   ', null, null, array[u1]);
    v_msg := 'accepté !';
  exception when others then
    get stacked diagnostics v_msg = message_text;
  end;
  insert into test_results values ('5. nom vide refusé', 'ensemble_name_required', v_msg,
    v_msg = 'ensemble_name_required');

  -- -------------------------------------------------------------------- employé
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_staff::text, 'role', 'authenticated')::text, true);

  -- 6. l'employé ne crée pas
  begin
    perform public.save_ensemble(null, 'Intrus', null, null, array[u1]);
    v_msg := 'accepté !';
  exception when others then
    get stacked diagnostics v_msg = message_text;
  end;
  insert into test_results values ('6. employé : création refusée par RLS',
    'refus', case when v_msg = 'accepté !' then v_msg else 'refus' end, v_msg <> 'accepté !');

  -- 7. l'employé ne modifie pas (RLS rend 0 ligne -> not_found)
  begin
    perform public.save_ensemble(v_ens, 'Intrus', null, null, array[u1]);
    v_msg := 'accepté !';
  exception when others then
    get stacked diagnostics v_msg = message_text;
  end;
  insert into test_results values ('7. employé : modification refusée',
    'ensemble_not_found', v_msg, v_msg = 'ensemble_not_found');

  -- 8. mais il LIT l'ensemble (la saisie de commande en a besoin)
  select count(*)::text into v_items from public.ensemble_items where ensemble_id = v_ens;
  insert into test_results values ('8. employé : lecture des pièces', '2', v_items, v_items = '2');

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
