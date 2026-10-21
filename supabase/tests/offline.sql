-- =============================================================================
-- Hors ligne : un geste renvoyé par la file ne compte JAMAIS deux fois.
--
--   node scripts/run-sql.mjs supabase/tests/offline.sql
--
-- Le téléphone renvoie un geste dont il n'a pas reçu la réponse. Un
-- encaissement ou un frais portent un identifiant (`client_op_id`) : le second
-- envoi ne doit rien ajouter. Le script se termine par rollback.
-- =============================================================================

begin;

create temp table test_results (
  step text, attendu text, obtenu text, ok boolean
) on commit drop;

do $$
declare
  c_today constant date := '2026-09-11';
  v_op    uuid := gen_random_uuid();
  v_op2   uuid := gen_random_uuid();
  v_order bigint;
  v_paid  numeric;
  v_ret   numeric;
  v_count integer;
  v_state text;
begin
  insert into public.orders (customer_name, event_date, pickup_date, return_due_date, total_price, amount_paid)
  values ('ZZOFF client', c_today + 1, c_today, c_today + 2, 10000, 2000)
  returning id into v_order;

  -- --- 1. le même encaissement envoyé deux fois ne compte qu'une fois -------
  perform public.add_order_payment(v_order, 3000, v_op);
  v_ret := public.add_order_payment(v_order, 3000, v_op);
  select amount_paid into v_paid from public.orders where id = v_order;
  insert into test_results values ('1. Renvoi d''un encaissement ignoré', '5000', v_paid::text, v_paid = 5000);
  insert into test_results values ('2. Le renvoi rend le reste dû', '5000', v_ret::text, v_ret = 5000);

  select count(*) into v_count from public.order_payments where client_op_id = v_op;
  insert into test_results values ('3. Une seule ligne au journal', '1', v_count::text, v_count = 1);

  -- --- 2. un autre geste, lui, s'ajoute ---------------------------------------
  perform public.add_order_payment(v_order, 1000, v_op2);
  select amount_paid into v_paid from public.orders where id = v_order;
  insert into test_results values ('4. Un autre geste s''ajoute', '6000', v_paid::text, v_paid = 6000);

  -- --- 3. sans identifiant : comportement d'avant -----------------------------
  perform public.add_order_payment(v_order, 500);
  perform public.add_order_payment(v_order, 500);
  select amount_paid into v_paid from public.orders where id = v_order;
  insert into test_results values ('5. Sans identifiant, chaque appel compte', '7000', v_paid::text, v_paid = 7000);

  -- --- 4. le même frais inséré deux fois : refusé (23505) ---------------------
  insert into public.expenses (spent_on, category, amount, description, client_op_id)
  values (c_today, 'retouche', 800, 'ZZOFF tailleur', v_op);
  v_state := 'accepté';
  begin
    insert into public.expenses (spent_on, category, amount, description, client_op_id)
    values (c_today, 'retouche', 800, 'ZZOFF tailleur', v_op);
  exception when unique_violation then v_state := '23505';
  end;
  insert into test_results values ('6. Frais en double refusé', '23505', v_state, v_state = '23505');

  select count(*) into v_count from public.expenses where description = 'ZZOFF tailleur';
  insert into test_results values ('7. Un seul frais', '1', v_count::text, v_count = 1);

  -- Deux frais sans identifiant restent possibles (deux pressings identiques).
  insert into public.expenses (spent_on, category, amount, description)
  values (c_today, 'nettoyage', 300, 'ZZOFF pressing'), (c_today, 'nettoyage', 300, 'ZZOFF pressing');
  select count(*) into v_count from public.expenses where description = 'ZZOFF pressing';
  insert into test_results values ('8. Frais sans identifiant : pas de blocage', '2', v_count::text, v_count = 2);
end $$;

-- --- Commandes provisoires (phase 3) -------------------------------------------
do $$
declare
  c_day   constant date := '2031-03-10';
  v_op    uuid := gen_random_uuid();
  v_cat   bigint;
  v_model bigint;
  v_unit  bigint;
  v_id    bigint;
  v_id2   bigint;
  v_ver   bigint;
  v_count integer;
  v_state text;
  v_lines jsonb;
begin
  select id into v_cat from public.categories where slug = 'veste';
  insert into public.article_models (ref_code, name_fr, category_id, base_price)
  values ('ZZOFFC', 'Modele hors ligne', v_cat, 1000) returning id into v_model;
  insert into public.article_units (model_id, ref_code, size)
  values (v_model, 'ZZOFFC-01', '50') returning id into v_unit;
  v_lines := jsonb_build_array(jsonb_build_object('unitId', v_unit, 'unitPrice', 8000));

  -- 9. La même commande renvoyée deux fois n'en crée qu'une.
  v_id := public.create_order_once(v_op, 'ZZOFF provisoire', '', c_day, c_day - 1, c_day + 1, 0, 2000, 0, '', v_lines);
  v_id2 := public.create_order_once(v_op, 'ZZOFF provisoire', '', c_day, c_day - 1, c_day + 1, 0, 2000, 0, '', v_lines);
  select count(*) into v_count from public.orders where customer_name = 'ZZOFF provisoire';
  insert into test_results values ('9. Commande renvoyée : une seule créée', '1', v_count::text, v_count = 1);
  insert into test_results values ('10. Le renvoi rend la même commande', v_id::text, v_id2::text, v_id = v_id2);

  -- 11. Une AUTRE commande provisoire sur la même veste : refusée par EXCLUDE,
  --     et rien ne reste.
  v_state := 'acceptée';
  begin
    perform public.create_order_once(gen_random_uuid(), 'ZZOFF concurrent', '', c_day, c_day - 1, c_day + 1, 0, 0, 0, '', v_lines);
  exception when exclusion_violation then v_state := '23P01';
  end;
  select count(*) into v_count from public.orders where customer_name = 'ZZOFF concurrent';
  insert into test_results values ('11. Pièce déjà louée : refusée', '23P01 / 0', v_state || ' / ' || v_count, v_state = '23P01' and v_count = 0);

  -- 12. Modification à partir de la bonne version : acceptée.
  select version into v_ver from public.orders where id = v_id;
  perform public.update_order_checked(v_ver, v_id, 'ZZOFF provisoire', '0550', c_day, c_day - 1, c_day + 1, 2000, 0, 'note', false, false, v_lines);
  select count(*) into v_count from public.orders where id = v_id and customer_phone = '0550';
  insert into test_results values ('12. Modification à jour acceptée', '1', v_count::text, v_count = 1);

  -- 13. La même version, désormais périmée : refusée (un collègue est passé).
  v_state := 'acceptée';
  begin
    perform public.update_order_checked(v_ver, v_id, 'ZZOFF écrasé', '', c_day, c_day - 1, c_day + 1, 0, 0, '', false, false, v_lines);
  exception when sqlstate 'P0005' then v_state := 'P0005';
  end;
  select count(*) into v_count from public.orders where customer_name = 'ZZOFF écrasé';
  insert into test_results values ('13. Version périmée refusée, rien écrasé', 'P0005 / 0', v_state || ' / ' || v_count, v_state = 'P0005' and v_count = 0);

  -- 14. Un encaissement compte comme un changement : la modification hors
  --     ligne ne peut plus écraser le versement.
  select version into v_ver from public.orders where id = v_id;
  perform public.add_order_payment(v_id, 1000);
  v_state := 'acceptée';
  begin
    perform public.update_order_checked(v_ver, v_id, 'ZZOFF provisoire', '', c_day, c_day - 1, c_day + 1, 2000, 0, '', false, false, v_lines);
  exception when sqlstate 'P0005' then v_state := 'P0005';
  end;
  insert into test_results values ('14. Encaissement entre-temps : refusée', 'P0005', v_state, v_state = 'P0005');
end $$;

select case when ok then 'OK  ' else 'ECHEC' end as resultat, step, attendu, obtenu
from test_results order by step;

select count(*) filter (where ok) || '/' || count(*) as bilan,
       case when count(*) filter (where not ok) = 0
            then 'TOUT PASSE' else 'DES TESTS ECHOUENT' end as verdict
from test_results;

rollback;
