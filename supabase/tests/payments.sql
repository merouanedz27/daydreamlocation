-- =============================================================================
-- Vérification de `add_order_payment` — l'encaissement du reste
--
--   node scripts/run-sql.mjs supabase/tests/payments.sql
--
-- Le script s'annule entièrement (rollback) : il ne laisse aucune donnée.
--
-- C'est de l'ARGENT. Un versement perdu ou compté deux fois ne se voit pas à
-- l'écran : il ressemble à un versement juste. D'où ce test, et notamment les
-- deux cas qui ne peuvent PAS être vérifiés à la main depuis l'interface :
-- le refus d'un retrait plus grand que les versements, et le refus
-- d'encaisser sur une commande annulée.
-- =============================================================================

begin;

create temp table test_results (
  step text, attendu text, obtenu text, ok boolean
) on commit drop;

do $$
declare
  c_today constant date := '2026-09-11';
  v_cat   bigint;
  v_model bigint;
  v_unit  bigint;
  v_order bigint;
  v_paid  numeric;
  v_bal   numeric;
  v_ret   numeric;
  v_msg   text;
begin
  select id into v_cat from public.categories where slug = 'veste';

  insert into public.article_models (ref_code, name_fr, category_id, base_price)
  values ('ZZPAY', 'Modele encaissement', v_cat, 1000)
  returning id into v_model;

  insert into public.article_units (model_id, ref_code, size)
  values (v_model, 'ZZPAY-01', '50')
  returning id into v_unit;

  -- Commande à 10 000, dont 2 000 déjà versés à la réservation.
  insert into public.orders (customer_name, event_date, pickup_date, return_due_date, amount_paid)
  values ('ZZPAY client', c_today + 1, c_today, c_today + 2, 2000)
  returning id into v_order;
  insert into public.order_lines (order_id, unit_id, unit_price)
  values (v_order, v_unit, 10000);

  -- --- 1. le versement s'ajoute, et rend le nouveau reste ---------------------
  v_ret := public.add_order_payment(v_order, 3000);
  select amount_paid, balance into v_paid, v_bal from public.orders where id = v_order;

  insert into test_results
  select '1. Versement ajoute (2000 + 3000)', '5000 / reste 5000',
         v_paid::text || ' / reste ' || v_bal::text,
         v_paid = 5000 and v_bal = 5000;

  insert into test_results
  select '2. La fonction rend le nouveau reste', '5000', v_ret::text, v_ret = 5000;

  -- --- 3. deux versements s'ADDITIONNENT, ils ne s'ecrasent pas ---------------
  -- Le coeur du choix d'une fonction SQL : un `update amount_paid = <valeur>`
  -- calcule en JavaScript perdrait le premier des deux.
  perform public.add_order_payment(v_order, 5000);
  select amount_paid, balance into v_paid, v_bal from public.orders where id = v_order;

  insert into test_results
  select '3. Solde par un second versement', '10000 / reste 0',
         v_paid::text || ' / reste ' || v_bal::text,
         v_paid = 10000 and v_bal = 0;

  -- --- 4. correction : un montant negatif retire --------------------------
  perform public.add_order_payment(v_order, -4000);
  select amount_paid into v_paid from public.orders where id = v_order;

  insert into test_results
  select '4. Correction d une saisie (-4000)', '6000', v_paid::text, v_paid = 6000;

  -- --- 5. retirer plus que ce qui a ete verse : REFUS -------------------------
  begin
    perform public.add_order_payment(v_order, -99000);
    insert into test_results values ('5. Retrait trop grand refuse', 'refus', 'ACCEPTE', false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into test_results
    select '5. Retrait trop grand refuse', 'payment_too_large', v_msg,
           v_msg = 'payment_too_large';
  end;

  select amount_paid into v_paid from public.orders where id = v_order;
  insert into test_results
  select '6. Le refus n a rien modifie', '6000', v_paid::text, v_paid = 6000;

  -- --- 7. montant nul : REFUS ------------------------------------------------
  begin
    perform public.add_order_payment(v_order, 0);
    insert into test_results values ('7. Montant nul refuse', 'refus', 'ACCEPTE', false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into test_results
    select '7. Montant nul refuse', 'payment_zero', v_msg, v_msg = 'payment_zero';
  end;

  -- --- 8. commande annulee : REFUS -------------------------------------------
  -- Une commande annulee est sortie du chiffre d'affaires ; y faire entrer de
  -- l'argent la rendrait incoherente avec le tableau de bord.
  perform public.set_order_cancelled(v_order, true);
  begin
    perform public.add_order_payment(v_order, 1000);
    insert into test_results values ('8. Encaissement sur commande annulee', 'refus', 'ACCEPTE', false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into test_results
    select '8. Encaissement sur commande annulee', 'payment_on_cancelled', v_msg,
           v_msg = 'payment_on_cancelled';
  end;

  -- --- 9. commande inexistante ----------------------------------------------
  begin
    perform public.add_order_payment(-1, 1000);
    insert into test_results values ('9. Commande inexistante', 'refus', 'ACCEPTE', false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into test_results
    select '9. Commande inexistante', 'payment_order_not_found', v_msg,
           v_msg = 'payment_order_not_found';
  end;
end $$;

select case when ok then 'OK  ' else 'ECHEC' end as resultat, step, attendu, obtenu
from test_results order by lpad(split_part(step, '.', 1), 3, '0');

select count(*) filter (where ok) || '/' || count(*) || ' tests reussis' as bilan,
       case when count(*) filter (where not ok) = 0
            then 'TOUT PASSE' else 'DES TESTS ECHOUENT' end as verdict
from test_results;

rollback;
