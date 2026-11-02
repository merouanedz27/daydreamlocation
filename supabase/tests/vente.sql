-- =============================================================================
-- Vente : une paire vendue ne se vend (ni ne se loue) qu'une fois.
--
--   node scripts/run-sql.mjs supabase/tests/vente.sql
--
-- Une ligne de vente bloque sa pièce de son retrait à l'infini. C'est la même
-- contrainte `no_double_booking` qui refuse la seconde vente. Le script se
-- termine par rollback.
-- =============================================================================

begin;

create temp table test_results (
  step text, attendu text, obtenu text, ok boolean
) on commit drop;

do $$
declare
  v_cat     bigint := (select id from public.categories where slug = 'chaussures');
  v_shoe    bigint;
  v_jacket  bigint;
  v_pair    bigint;
  v_pair2   bigint;
  v_veste   bigint;
  v_a       bigint;
  v_b       bigint;
  v_c       bigint;
  v_rec     record;
  v_msg     text;
begin
  insert into public.article_models (ref_code, name_fr, category_id, base_price, purpose)
  values ('ZZV-Shoe', 'Chaussure de test', v_cat, 9000, 'vente') returning id into v_shoe;
  insert into public.article_models (ref_code, name_fr, category_id, base_price)
  values ('ZZV-Veste', 'Veste de test', (select id from public.categories where slug = 'veste'), 3000)
  returning id into v_jacket;

  insert into public.article_units (model_id, ref_code, size) values (v_shoe, 'ZZV-Shoe-01', '42')
  returning id into v_pair;
  insert into public.article_units (model_id, ref_code, size) values (v_shoe, 'ZZV-Shoe-02', '42')
  returning id into v_pair2;
  insert into public.article_units (model_id, ref_code, size) values (v_jacket, 'ZZV-Veste-01', '50')
  returning id into v_veste;

  -- --- 1. location + vente dans la même commande ------------------------------
  v_a := public.create_order(
    p_customer_name := 'ZZV A', p_customer_phone := null, p_event_date := '2031-06-10',
    p_lines := jsonb_build_array(
      jsonb_build_object('unitId', v_veste, 'unitPrice', 3000),
      jsonb_build_object('unitId', v_pair, 'unitPrice', 9000)));

  select line_kind, upper_inf(rental_range) as sans_fin into v_rec
  from public.order_lines where order_id = v_a and unit_id = v_pair;
  insert into test_results values ('1. La ligne de vente est posée par la base, sans fin',
    'vente / sans fin', v_rec.line_kind || ' / ' || case when v_rec.sans_fin then 'sans fin' else 'bornée' end,
    v_rec.line_kind = 'vente' and v_rec.sans_fin);

  select line_kind into v_rec from public.order_lines where order_id = v_a and unit_id = v_veste;
  insert into test_results values ('2. La veste reste une location', 'location', v_rec.line_kind,
    v_rec.line_kind = 'location');

  select has_rental, total_price into v_rec from public.orders where id = v_a;
  insert into test_results values ('3. Commande mixte : à rendre, total = location + vente',
    'true / 12000', v_rec.has_rental || ' / ' || v_rec.total_price,
    v_rec.has_rental and v_rec.total_price = 12000);

  -- --- 2. la même paire, des années plus tard : refusée -----------------------
  v_msg := 'acceptée';
  begin
    perform public.create_order(
      p_customer_name := 'ZZV B', p_customer_phone := null, p_event_date := '2035-01-10',
      p_lines := jsonb_build_array(jsonb_build_object('unitId', v_pair, 'unitPrice', 9000)));
  exception when others then v_msg := sqlerrm;
  end;
  insert into test_results values ('4. Paire déjà vendue : refusée, même bien plus tard',
    'unit_unavailable:ZZV-Shoe-01', v_msg, v_msg = 'unit_unavailable:ZZV-Shoe-01');

  -- ... et même AVANT la vente : la plage sans fin couvre aussi ce qui suit.
  v_msg := 'acceptée';
  begin
    perform public.create_order(
      p_customer_name := 'ZZV B', p_customer_phone := null, p_event_date := '2031-01-10',
      p_lines := jsonb_build_array(jsonb_build_object('unitId', v_pair, 'unitPrice', 9000)));
  exception when others then v_msg := sqlerrm;
  end;
  insert into test_results values ('5. Paire vendue plus tard : refusée aussi plus tôt',
    'unit_unavailable:ZZV-Shoe-01', v_msg, v_msg = 'unit_unavailable:ZZV-Shoe-01');

  -- --- 3. l'annulation libère la paire ----------------------------------------
  perform public.set_order_cancelled(v_a, true);
  v_b := public.create_order(
    p_customer_name := 'ZZV B', p_customer_phone := null, p_event_date := '2031-06-12',
    p_lines := jsonb_build_array(jsonb_build_object('unitId', v_pair, 'unitPrice', 9000)));
  insert into test_results values ('6. Commande annulée : la paire se revend', 'créée',
    case when v_b is not null then 'créée' else 'refusée' end, v_b is not null);

  -- --- 4. vente seule : rien à rendre -----------------------------------------
  select has_rental into v_rec from public.orders where id = v_b;
  insert into test_results values ('7. Vente seule : has_rental faux', 'false', v_rec.has_rental::text,
    not v_rec.has_rental);

  update public.orders set picked_up = true where id = v_b;
  select status, returned into v_rec from public.orders where id = v_b;
  insert into test_results values ('8. Vente seule : Allez Valid la termine', 'retournee / true',
    v_rec.status || ' / ' || v_rec.returned, v_rec.status = 'retournee' and v_rec.returned);

  -- --- 5. modifier la commande : la vente reste une vente ---------------------
  perform public.update_order(
    p_order_id := v_b, p_customer_name := 'ZZV B', p_customer_phone := null,
    p_event_date := '2031-06-12', p_pickup_date := '2031-06-12', p_return_due_date := '2031-06-12',
    p_picked_up := true, p_returned := false,
    p_lines := jsonb_build_array(
      jsonb_build_object('unitId', v_pair, 'unitPrice', 8500),
      jsonb_build_object('unitId', v_pair2, 'unitPrice', 8500)));
  select o.has_rental, o.status, count(*) filter (where l.line_kind = 'vente') as ventes into v_rec
  from public.orders o join public.order_lines l on l.order_id = o.id
  where o.id = v_b group by o.has_rental, o.status;
  insert into test_results values ('9. Modifiée : deux ventes, toujours terminée',
    'false / retournee / 2', v_rec.has_rental || ' / ' || v_rec.status || ' / ' || v_rec.ventes,
    not v_rec.has_rental and v_rec.status = 'retournee' and v_rec.ventes = 2);

  -- --- 6. l'usage d'un modèle déjà commandé est figé --------------------------
  v_msg := 'accepté';
  begin
    update public.article_models set purpose = 'location' where id = v_shoe;
  exception when others then v_msg := sqlerrm;
  end;
  insert into test_results values ('10. Usage figé une fois commandé', 'purpose_locked', v_msg,
    v_msg = 'purpose_locked');

  -- --- 7. un ensemble refuse une pièce de vente -------------------------------
  v_msg := 'accepté';
  begin
    perform public.save_ensemble(p_name := 'ZZV ensemble', p_unit_ids := array[v_veste, v_pair2]);
  exception when others then v_msg := sqlerrm;
  end;
  insert into test_results values ('11. Ensemble : pièce de vente refusée', 'ensemble_unit_invalid', v_msg,
    v_msg = 'ensemble_unit_invalid');

  -- --- 8. une location ne devient pas « à rendre » par erreur -----------------
  v_c := public.create_order(
    p_customer_name := 'ZZV C', p_customer_phone := null, p_event_date := '2031-07-10',
    p_lines := jsonb_build_array(jsonb_build_object('unitId', v_veste, 'unitPrice', 3000)));
  update public.orders set picked_up = true where id = v_c;
  select has_rental, status, returned into v_rec from public.orders where id = v_c;
  insert into test_results values ('12. Location : Allez Valid ne coche pas le retour',
    'true / en_cours / false', v_rec.has_rental || ' / ' || v_rec.status || ' / ' || v_rec.returned,
    v_rec.has_rental and v_rec.status = 'en_cours' and not v_rec.returned);
end $$;

select
  case when ok then 'OK  ' else 'ECHEC' end as resultat,
  step, attendu, obtenu
from test_results
order by step;

select
  count(*) filter (where ok) || '/' || count(*) || ' tests reussis' as bilan,
  case when count(*) filter (where not ok) = 0
       then 'TOUT PASSE' else 'DES TESTS ECHOUENT' end as verdict
from test_results;

rollback;
