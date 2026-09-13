-- =============================================================================
-- Vérification du moteur de disponibilité
--
--   npx supabase db query -f supabase/tests/availability.sql --db-url "..."
--
-- Le script s'annule entièrement (rollback) : il ne laisse aucune donnée.
-- Il prouve la seule chose qui compte vraiment dans cette application : une
-- pièce déjà louée ne peut pas être relouée sur des dates qui se chevauchent,
-- et c'est POSTGRES qui refuse — pas le code applicatif.
--
-- À rejouer après toute modification de `orders`, `order_lines` ou des triggers.
-- =============================================================================

begin;

create temp table test_results (
  step text,
  attendu text,
  obtenu text,
  ok boolean
) on commit drop;

do $$
declare
  v_model_id bigint;
  v_unit1 bigint;
  v_unit2 bigint;
  v_hafid bigint;
  v_zohir bigint;
  v_karim bigint;
  v_rec record;
begin
  -- --- jeu d'essai ----------------------------------------------------------
  insert into public.article_models (ref_code, name_fr, category_id, base_price)
  values ('TEST-Gio-079', 'Veste de test',
          (select id from public.categories where slug = 'veste'), 3000)
  returning id into v_model_id;

  insert into public.article_units (model_id, ref_code, size)
  values (v_model_id, 'TEST-Gio-079-01', '50') returning id into v_unit1;

  insert into public.article_units (model_id, ref_code, size)
  values (v_model_id, 'TEST-Gio-079-02', '50') returning id into v_unit2;

  -- Mariage du 26/08. L'employé ne saisit QUE cette date.
  insert into public.orders (customer_name, event_date)
  values ('Hafid', '2026-08-26') returning id into v_hafid;

  insert into public.order_lines (order_id, unit_id, unit_price)
  values (v_hafid, v_unit1, 3000);

  -- --- 1. fenêtre déduite d'une seule date ----------------------------------
  select pickup_date, return_due_date into v_rec
  from public.orders where id = v_hafid;

  insert into test_results values (
    '1. fenetre deduite de l evenement',
    '25/08 -> 27/08',
    to_char(v_rec.pickup_date, 'DD/MM') || ' -> ' || to_char(v_rec.return_due_date, 'DD/MM'),
    v_rec.pickup_date = '2026-08-25' and v_rec.return_due_date = '2026-08-27'
  );

  -- --- 2. plage bloquée = retour + battement nettoyage -----------------------
  select rental_range::text as r into v_rec
  from public.order_lines where order_id = v_hafid;

  insert into test_results values (
    '2. plage bloquee (retour + nettoyage)',
    '[2026-08-25,2026-08-29)',
    v_rec.r,
    v_rec.r = '[2026-08-25,2026-08-29)'
  );

  -- --- 3. totaux recalculés depuis les lignes --------------------------------
  update public.orders set amount_paid = 3000 where id = v_hafid;
  select total_price, amount_paid, balance into v_rec
  from public.orders where id = v_hafid;

  insert into test_results values (
    '3. total et reste calcules',
    'total 3000 / verse 3000 / reste 0',
    'total ' || v_rec.total_price::int || ' / verse ' || v_rec.amount_paid::int
      || ' / reste ' || v_rec.balance::int,
    v_rec.total_price = 3000 and v_rec.balance = 0
  );

  -- --- 4. LE test : même pièce, dates qui se chevauchent ---------------------
  insert into public.orders (customer_name, event_date)
  values ('Zohir', '2026-08-27') returning id into v_zohir;

  begin
    insert into public.order_lines (order_id, unit_id, unit_price)
    values (v_zohir, v_unit1, 3000);
    insert into test_results values (
      '4. MEME piece, dates chevauchantes', 'refus 23P01', 'ACCEPTE', false);
  exception when exclusion_violation then
    insert into test_results values (
      '4. MEME piece, dates chevauchantes', 'refus 23P01', 'refus 23P01', true);
  end;

  -- --- 5. autre exemplaire, même taille, mêmes dates -> doit passer ----------
  begin
    insert into public.order_lines (order_id, unit_id, unit_price)
    values (v_zohir, v_unit2, 3000);
    insert into test_results values (
      '5. AUTRE exemplaire meme taille', 'accepte', 'accepte', true);
  exception when exclusion_violation then
    insert into test_results values (
      '5. AUTRE exemplaire meme taille', 'accepte', 'REFUSE A TORT', false);
  end;

  -- --- 6. pièce externe (FETHI LOC) : aucun blocage --------------------------
  begin
    insert into public.order_lines
      (order_id, external_source, external_label, external_cost, unit_price)
    values (v_zohir, 'Fethi', 'Veste taille 60', 1500, 4000);
    insert into test_results values (
      '6. piece sous-louee (sans unit_id)', 'accepte', 'accepte', true);
  exception when others then
    insert into test_results values (
      '6. piece sous-louee (sans unit_id)', 'accepte', 'REFUSE: ' || sqlerrm, false);
  end;

  -- --- 7. annuler la commande libère la pièce --------------------------------
  update public.orders set status = 'annulee' where id = v_hafid;
  begin
    insert into public.order_lines (order_id, unit_id, unit_price)
    values (v_zohir, v_unit1, 3000);
    insert into test_results values (
      '7. annulation libere la piece', 'accepte', 'accepte', true);
  exception when exclusion_violation then
    insert into test_results values (
      '7. annulation libere la piece', 'accepte', 'ENCORE BLOQUEE', false);
  end;

  -- --- 8. décaler une commande sur un créneau déjà pris ----------------------
  -- Le piège classique : changer les dates sans re-verifier les pieces.
  insert into public.orders (customer_name, event_date)
  values ('Karim', '2026-12-25') returning id into v_karim;
  insert into public.order_lines (order_id, unit_id, unit_price)
  values (v_karim, v_unit2, 3000);

  begin
    update public.orders
    set event_date = '2026-08-27', pickup_date = '2026-08-26',
        return_due_date = '2026-08-28'
    where id = v_karim;
    insert into test_results values (
      '8. decalage vers creneau pris', 'refus 23P01', 'ACCEPTE', false);
  exception when exclusion_violation then
    insert into test_results values (
      '8. decalage vers creneau pris', 'refus 23P01', 'refus 23P01', true);
  end;

  -- --- 9. balance est générée, non écrivable ---------------------------------
  begin
    update public.orders set balance = 999 where id = v_zohir;
    insert into test_results values (
      '9. balance non ecrivable', 'refus', 'ECRITURE ACCEPTEE', false);
  exception when others then
    insert into test_results values (
      '9. balance non ecrivable', 'refus', 'refus (' || sqlstate || ')', true);
  end;

  -- --- 10. RLS active sur toutes les tables publiques -------------------------
  select count(*)::int as n, string_agg(tablename, ', ') as noms into v_rec
  from pg_tables
  where schemaname = 'public' and not rowsecurity;

  insert into test_results values (
    '10. RLS active partout',
    '0 table sans RLS',
    coalesce(v_rec.n, 0) || ' sans RLS' || coalesce(' : ' || v_rec.noms, ''),
    coalesce(v_rec.n, 0) = 0
  );

  -- --- 11. create_order est ATOMIQUE ----------------------------------------
  -- Le scenario qui justifie la fonction SQL : une commande dont la PREMIERE
  -- piece est libre et la SECONDE deja louee. Si la creation n'etait pas
  -- atomique, la commande et sa premiere ligne resteraient en base, bloquant
  -- une piece au profit d'une commande fantome.
  declare
    v_m2      bigint;
    v_libre   bigint;
    v_avant   int;
    v_apres   int;
    v_lignes  int;
    v_msg     text;
    v_cmd     bigint;
  begin
    insert into public.article_models (ref_code, name_fr, category_id, base_price)
    values ('TEST-ATOM', 'Veste atomique',
            (select id from public.categories where slug = 'veste'), 4000)
    returning id into v_m2;

    insert into public.article_units (model_id, ref_code, size)
    values (v_m2, 'TEST-ATOM-01', '52') returning id into v_libre;

    select count(*)::int into v_avant from public.orders;

    begin
      select public.create_order(
        p_customer_name := 'Atomique',
        p_customer_phone := null,
        p_event_date := '2026-08-27',
        p_lines := jsonb_build_array(
          jsonb_build_object('unitId', v_libre, 'unitPrice', 4000),
          jsonb_build_object('unitId', v_unit1, 'unitPrice', 3000)
        )
      ) into v_cmd;
      v_msg := 'ACCEPTE A TORT';
    exception when exclusion_violation then
      v_msg := sqlerrm;
    end;

    select count(*)::int into v_apres from public.orders;

    insert into test_results values (
      '11a. create_order refuse et nomme la piece',
      'unit_unavailable:TEST-Gio-079-01',
      v_msg,
      v_msg = 'unit_unavailable:TEST-Gio-079-01'
    );

    insert into test_results values (
      '11b. create_order atomique (rien ne subsiste)',
      'aucune commande creee',
      (v_apres - v_avant) || ' commande(s) creee(s)',
      v_apres = v_avant
    );

    -- La piece libre ne doit pas non plus etre restee bloquee.
    select count(*)::int into v_lignes
    from public.order_lines where unit_id = v_libre;

    insert into test_results values (
      '11c. la piece libre n est pas restee bloquee',
      '0 ligne',
      v_lignes || ' ligne(s)',
      v_lignes = 0
    );

    -- --- 12. ensemble eclate : chaque piece se bloque SEULE ------------------
    -- Le cas d'usage signale par le client : on prend la veste du Costume n12
    -- avec la chemise d'un autre. La chemise du n12 doit rester louable.
    declare
      v_mchem  bigint;
      v_chem1  bigint;
      v_chem2  bigint;
      v_ens    bigint;
      v_ok     boolean;
      v_cmd2   bigint;
    begin
      insert into public.article_models (ref_code, name_fr, category_id, base_price)
      values ('TEST-CHM', 'Chemise de test',
              (select id from public.categories where slug = 'chemise'), 1000)
      returning id into v_mchem;

      insert into public.article_units (model_id, ref_code, size)
      values (v_mchem, 'TEST-CHM-01', 'M') returning id into v_chem1;
      insert into public.article_units (model_id, ref_code, size)
      values (v_mchem, 'TEST-CHM-02', 'M') returning id into v_chem2;

      -- « Costume n12 » = la veste libre + la chemise 01.
      insert into public.ensembles (name, package_price)
      values ('TEST Costume n12', 4500) returning id into v_ens;
      insert into public.ensemble_items (ensemble_id, unit_id)
      values (v_ens, v_libre), (v_ens, v_chem1);

      -- On prend la VESTE du n12 mais la chemise 02, prise ailleurs.
      select public.create_order(
        p_customer_name := 'Ensemble eclate',
        p_customer_phone := null,
        p_event_date := '2026-09-20',
        p_lines := jsonb_build_array(
          jsonb_build_object('unitId', v_libre, 'unitPrice', 4000),
          jsonb_build_object('unitId', v_chem2, 'unitPrice', 1000)
        )
      ) into v_cmd2;

      -- La chemise 01, qui appartient pourtant au meme ensemble, reste libre.
      begin
        select public.create_order(
          p_customer_name := 'Autre client',
          p_customer_phone := null,
          p_event_date := '2026-09-20',
          p_lines := jsonb_build_array(
            jsonb_build_object('unitId', v_chem1, 'unitPrice', 1000)
          )
        ) into v_cmd;
        v_ok := true;
      exception when exclusion_violation then
        v_ok := false;
      end;

      insert into test_results values (
        '12a. ensemble eclate : la piece restante reste louable',
        'accepte', case when v_ok then 'accepte' else 'REFUSE A TORT' end, v_ok);

      -- Mais la veste partie avec l'autre commande, elle, est bien bloquee.
      begin
        select public.create_order(
          p_customer_name := 'Troisieme client',
          p_customer_phone := null,
          p_event_date := '2026-09-20',
          p_lines := jsonb_build_array(
            jsonb_build_object('unitId', v_libre, 'unitPrice', 4000)
          )
        ) into v_cmd;
        v_ok := false;
      exception when exclusion_violation then
        v_ok := true;
      end;

      insert into test_results values (
        '12b. ensemble eclate : la piece partie est bloquee',
        'refus 23P01', case when v_ok then 'refus 23P01' else 'ACCEPTE A TORT' end, v_ok);
    end;
  end;

  -- --- 13. set_order_cancelled : annuler, puis tenter de revenir ------------
  -- Le test 7 prouve que le STATUT libere la piece. Celui-ci prouve que le
  -- point d'entree de l'application fait la meme chose, et surtout qu'il refuse
  -- BIEN la reactivation d'une commande dont la piece est repartie ailleurs.
  declare
    v_m3      bigint;
    v_u3      bigint;
    v_a       bigint;
    v_b       bigint;
    v_statut  text;
    v_actives int;
    v_msg     text;
    v_ok      boolean;
  begin
    insert into public.article_models (ref_code, name_fr, category_id, base_price)
    values ('TEST-ANNUL', 'Veste annulable',
            (select id from public.categories where slug = 'veste'), 3000)
    returning id into v_m3;

    insert into public.article_units (model_id, ref_code, size)
    values (v_m3, 'TEST-ANNUL-01', '50') returning id into v_u3;

    insert into public.orders (customer_name, event_date)
    values ('Rachid', '2026-10-10') returning id into v_a;
    insert into public.order_lines (order_id, unit_id, unit_price)
    values (v_a, v_u3, 3000);

    -- 13a. la fonction annule ET desactive les lignes
    select public.set_order_cancelled(v_a, true) into v_statut;
    select count(*)::int into v_actives
    from public.order_lines where order_id = v_a and is_active;

    insert into test_results values (
      '13a. set_order_cancelled desactive les lignes',
      'annulee / 0 active',
      v_statut || ' / ' || v_actives || ' active(s)',
      v_statut = 'annulee' and v_actives = 0);

    -- La piece doit etre REELLEMENT relouable : une autre commande la prend.
    insert into public.orders (customer_name, event_date)
    values ('Samir', '2026-10-11') returning id into v_b;
    begin
      insert into public.order_lines (order_id, unit_id, unit_price)
      values (v_b, v_u3, 3000);
      v_ok := true;
    exception when exclusion_violation then
      v_ok := false;
    end;

    insert into test_results values (
      '13b. la piece liberee est relouable',
      'accepte', case when v_ok then 'accepte' else 'ENCORE BLOQUEE' end, v_ok);

    -- 13c. revenir en arriere devient impossible, et le dit en NOMMANT la piece
    begin
      select public.set_order_cancelled(v_a, false) into v_statut;
      v_ok := false;
      v_msg := 'ACCEPTE A TORT';
    exception when exclusion_violation then
      v_ok := sqlerrm like '%unit_unavailable:TEST-ANNUL-01%';
      v_msg := sqlerrm;
    end;

    insert into test_results values (
      '13c. reactivation refusee, piece nommee',
      'unit_unavailable:TEST-ANNUL-01', v_msg, v_ok);

    -- 13d. et l'echec ne laisse rien derriere lui : la commande reste annulee
    select status into v_statut from public.orders where id = v_a;
    insert into test_results values (
      '13d. echec sans effet de bord',
      'annulee', v_statut, v_statut = 'annulee');

    -- 13e. le creneau redevenu libre, la reactivation repasse
    perform public.set_order_cancelled(v_b, true);
    select public.set_order_cancelled(v_a, false) into v_statut;
    select count(*)::int into v_actives
    from public.order_lines where order_id = v_a and is_active;

    insert into test_results values (
      '13e. reactivation sur creneau libre',
      'reservee / 1 active',
      v_statut || ' / ' || v_actives || ' active(s)',
      v_statut = 'reservee' and v_actives = 1);
  end;

  -- --- 14. « bloquee ce jour-la » : la regle du compteur du stock ------------
  -- La liste du stock ne remonte plus l'historique sous chaque piece : elle
  -- demande a la base les pieces bloquees UN JOUR donne, en faisant chevaucher
  -- la plage de location avec [jour, jour+1). Ce test prouve que ce
  -- chevauchement vaut exactement « la plage contient ce jour », battement de
  -- nettoyage compris.
  declare
    v_plage daterange := daterange('2026-08-25', '2026-08-29', '[)');
    v_jour  date;
    v_got   text := '';
  begin
    foreach v_jour in array array[
      '2026-08-24',  -- la veille du retrait     -> libre
      '2026-08-25',  -- retrait                  -> bloquee
      '2026-08-27',  -- retour prevu             -> bloquee
      '2026-08-28',  -- battement de nettoyage   -> bloquee
      '2026-08-29'   -- borne haute EXCLUSIVE    -> libre
    ]::date[]
    loop
      v_got := v_got || case
        when v_plage && daterange(v_jour, v_jour + 1, '[)') then 'X'
        else '.'
      end;
    end loop;

    insert into test_results values (
      '14. jour bloque = chevauchement [j, j+1)',
      '.XXX.', v_got, v_got = '.XXX.');
  end;

  -- --- 15. les deux cases : le statut se DEDUIT ------------------------------
  -- La regle du projet : « Allez Valid » / « Retour Val » restent deux cases,
  -- le statut n'est jamais saisi. Ce test prouve les quatre transitions, la
  -- date de retour reelle, et le garde qui protege une commande annulee.
  declare
    v_m4     bigint;
    v_u4     bigint;
    v_c      bigint;
    v_statut text;
    v_date   date;
    v_rec2   record;
  begin
    insert into public.article_models (ref_code, name_fr, category_id, base_price)
    values ('TEST-CASES', 'Veste a cocher',
            (select id from public.categories where slug = 'veste'), 3000)
    returning id into v_m4;

    insert into public.article_units (model_id, ref_code, size)
    values (v_m4, 'TEST-CASES-01', '50') returning id into v_u4;

    insert into public.orders (customer_name, event_date)
    values ('Bilal', '2026-11-14') returning id into v_c;
    insert into public.order_lines (order_id, unit_id, unit_price)
    values (v_c, v_u4, 3000);

    -- 15a. a la creation, rien n'est coche
    select status into v_statut from public.orders where id = v_c;
    insert into test_results values (
      '15a. a la creation : reservee', 'reservee', v_statut, v_statut = 'reservee');

    -- 15b. « Aller valide » -> en_cours
    update public.orders set picked_up = true where id = v_c;
    select status, actual_return_date into v_rec2
    from public.orders where id = v_c;
    insert into test_results values (
      '15b. aller valide -> en_cours',
      'en_cours / retour null',
      v_rec2.status || ' / retour ' || coalesce(v_rec2.actual_return_date::text, 'null'),
      v_rec2.status = 'en_cours' and v_rec2.actual_return_date is null);

    -- 15c. « Retour valide » -> retournee, ET la date de retour reelle se pose
    update public.orders set returned = true where id = v_c;
    select status, actual_return_date into v_rec2
    from public.orders where id = v_c;
    insert into test_results values (
      '15c. retour valide -> retournee + date',
      'retournee / date posee',
      v_rec2.status || ' / ' || coalesce(v_rec2.actual_return_date::text, 'null'),
      v_rec2.status = 'retournee' and v_rec2.actual_return_date is not null);

    -- 15d. case decochee par erreur : aucun retour fantome ne subsiste
    update public.orders set returned = false where id = v_c;
    select status, actual_return_date into v_rec2
    from public.orders where id = v_c;
    insert into test_results values (
      '15d. retour decoche : date effacee',
      'en_cours / retour null',
      v_rec2.status || ' / retour ' || coalesce(v_rec2.actual_return_date::text, 'null'),
      v_rec2.status = 'en_cours' and v_rec2.actual_return_date is null);

    -- 15e. une commande ANNULEE ne ressuscite pas parce qu'on coche une case
    perform public.set_order_cancelled(v_c, true);
    update public.orders set picked_up = false, returned = true where id = v_c;
    select status into v_statut from public.orders where id = v_c;
    insert into test_results values (
      '15e. annulee reste annulee malgre les cases',
      'annulee', v_statut, v_statut = 'annulee');

    -- 15f. et la remise en service repart du statut deduit des cases
    select public.set_order_cancelled(v_c, false) into v_statut;
    insert into test_results values (
      '15f. remise en service = statut deduit',
      'retournee', v_statut, v_statut = 'retournee');
  end;

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
