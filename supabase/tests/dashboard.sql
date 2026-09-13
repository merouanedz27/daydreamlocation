-- =============================================================================
-- Vérification des chiffres du tableau de bord
--
--   node scripts/run-sql.mjs supabase/tests/dashboard.sql
--
-- Le script s'annule entièrement (rollback) : il ne laisse aucune donnée.
--
-- Ces chiffres seront comparés par le patron à ceux qu'il tient à la main.
-- Un total faux ne se voit pas : il ressemble à un total juste. D'où ce test.
--
-- On mesure des ÉCARTS (avant / après insertion) et non des valeurs absolues :
-- la base en ligne contient déjà des données réelles, et un test qui exigerait
-- « CA du mois = 10 000 » casserait à la première vraie commande.
-- =============================================================================

begin;

create temp table test_results (
  step text, attendu text, obtenu text, ok boolean
) on commit drop;

do $$
declare
  -- Vendredi. Semaine ISO du lundi 07 au dimanche 13 septembre.
  c_today  constant date := '2026-09-11';
  v_before jsonb;
  v_after  jsonb;
  v_cat    bigint;
  v_model  bigint;
  v_u      bigint[] := '{}';
  v_id     bigint;
  i        int;
begin
  v_before := public.dashboard_stats(c_today);

  select id into v_cat from public.categories where slug = 'veste';

  insert into public.article_models (ref_code, name_fr, category_id, base_price)
  values ('ZZDASH', 'Modele tableau de bord', v_cat, 1000)
  returning id into v_model;

  -- 10 pièces : 1 louée aujourd'hui, 1 nettoyage, 1 réparation, 1 retirée,
  -- 1 libre inutilisée, 5 portées par des commandes hors d'aujourd'hui.
  for i in 1..10 loop
    insert into public.article_units (model_id, ref_code, size)
    values (v_model, 'ZZDASH-' || lpad(i::text, 2, '0'), '50')
    returning id into v_id;
    v_u := v_u || v_id;
  end loop;

  update public.article_units set status = 'nettoyage'  where id = v_u[2];
  update public.article_units set status = 'reparation' where id = v_u[3];
  update public.article_units set status = 'retire'     where id = v_u[4];

  -- O1 — retrait AUJOURD'HUI. Caution volontairement énorme : elle ne doit
  -- apparaître dans AUCUN total. Versement partiel => impayé de 4 000.
  insert into public.orders (customer_name, event_date, amount_paid, caution_amount)
  values ('ZZDASH aujourdhui', '2026-09-12', 1000, 20000) returning id into v_id;
  insert into public.order_lines (order_id, unit_id, unit_price)
  values (v_id, v_u[1], 5000);

  -- O2 — plus tôt dans la même semaine. Soldée : ne doit pas peser en impayés.
  insert into public.orders (customer_name, event_date, pickup_date, return_due_date, amount_paid)
  values ('ZZDASH semaine', '2026-09-09', '2026-09-08', '2026-09-10', 3000)
  returning id into v_id;
  insert into public.order_lines (order_id, unit_id, unit_price)
  values (v_id, v_u[6], 3000);

  -- O3 — plus tard dans le MOIS (à venir) : compte au mois, pas à la semaine.
  insert into public.orders (customer_name, event_date, pickup_date, return_due_date)
  values ('ZZDASH fin de mois', '2026-09-26', '2026-09-25', '2026-09-27')
  returning id into v_id;
  insert into public.order_lines (order_id, unit_id, unit_price)
  values (v_id, v_u[7], 2000);

  -- O4 — plus tôt dans l'ANNÉE.
  insert into public.orders (customer_name, event_date, pickup_date, return_due_date)
  values ('ZZDASH mars', '2026-03-16', '2026-03-15', '2026-03-17')
  returning id into v_id;
  insert into public.order_lines (order_id, unit_id, unit_price)
  values (v_id, v_u[8], 7000);

  -- O5 — ANNULÉE. Ne doit compter nulle part, ni en recette ni en impayé.
  insert into public.orders (customer_name, event_date, pickup_date, return_due_date)
  values ('ZZDASH annulee', '2026-09-10', '2026-09-09', '2026-09-11')
  returning id into v_id;
  insert into public.order_lines (order_id, unit_id, unit_price)
  values (v_id, v_u[9], 9000);
  update public.orders set status = 'annulee' where id = v_id;

  -- O6 — ANNÉE PRÉCÉDENTE, dans la fenêtre du graphique 12 mois.
  insert into public.orders (customer_name, event_date, pickup_date, return_due_date)
  values ('ZZDASH an dernier', '2025-11-21', '2025-11-20', '2025-11-22')
  returning id into v_id;
  insert into public.order_lines (order_id, unit_id, unit_price)
  values (v_id, v_u[10], 4000);

  insert into public.expenses (spent_on, category, amount, description)
  values ('2026-09-11', 'nettoyage',   1500, 'ZZDASH jour'),
         ('2026-09-02', 'loyer',        500, 'ZZDASH mois'),
         ('2026-02-10', 'achat_stock', 2000, 'ZZDASH annee');

  v_after := public.dashboard_stats(c_today);

  -- --- recettes -------------------------------------------------------------
  insert into test_results
  select '1. CA du jour', '5000',
         ((v_after->'revenue'->>'day')::numeric - (v_before->'revenue'->>'day')::numeric)::text,
         (v_after->'revenue'->>'day')::numeric - (v_before->'revenue'->>'day')::numeric = 5000;

  insert into test_results
  select '2. CA de la semaine (lun-dim)', '8000',
         ((v_after->'revenue'->>'week')::numeric - (v_before->'revenue'->>'week')::numeric)::text,
         (v_after->'revenue'->>'week')::numeric - (v_before->'revenue'->>'week')::numeric = 8000;

  insert into test_results
  select '3. CA du mois (periode entiere)', '10000',
         ((v_after->'revenue'->>'month')::numeric - (v_before->'revenue'->>'month')::numeric)::text,
         (v_after->'revenue'->>'month')::numeric - (v_before->'revenue'->>'month')::numeric = 10000;

  insert into test_results
  select '4. CA de l annee', '17000',
         ((v_after->'revenue'->>'year')::numeric - (v_before->'revenue'->>'year')::numeric)::text,
         (v_after->'revenue'->>'year')::numeric - (v_before->'revenue'->>'year')::numeric = 17000;

  -- --- dépenses -------------------------------------------------------------
  insert into test_results
  select '5. Depenses du mois', '2000',
         ((v_after->'expenses'->>'month')::numeric - (v_before->'expenses'->>'month')::numeric)::text,
         (v_after->'expenses'->>'month')::numeric - (v_before->'expenses'->>'month')::numeric = 2000;

  insert into test_results
  select '6. Depenses de l annee', '4000',
         ((v_after->'expenses'->>'year')::numeric - (v_before->'expenses'->>'year')::numeric)::text,
         (v_after->'expenses'->>'year')::numeric - (v_before->'expenses'->>'year')::numeric = 4000;

  -- --- stock ----------------------------------------------------------------
  insert into test_results
  select '7. Piece louee AUJOURD HUI comptee comme louee', '1',
         ((v_after->'stock'->>'louee')::int - (v_before->'stock'->>'louee')::int)::text,
         (v_after->'stock'->>'louee')::int - (v_before->'stock'->>'louee')::int = 1;

  -- 10 pièces créées : 1 louée, 1 nettoyage, 1 réparation, 1 retirée => 6 libres.
  insert into test_results
  select '8. Pieces libres (la louee n en est pas)', '6',
         ((v_after->'stock'->>'disponible')::int - (v_before->'stock'->>'disponible')::int)::text,
         (v_after->'stock'->>'disponible')::int - (v_before->'stock'->>'disponible')::int = 6;

  insert into test_results
  select '9. Nettoyage / reparation / retire', '1 / 1 / 1',
         ((v_after->'stock'->>'nettoyage')::int - (v_before->'stock'->>'nettoyage')::int)::text
           || ' / ' ||
         ((v_after->'stock'->>'reparation')::int - (v_before->'stock'->>'reparation')::int)::text
           || ' / ' ||
         ((v_after->'stock'->>'retire')::int - (v_before->'stock'->>'retire')::int)::text,
         (v_after->'stock'->>'nettoyage')::int - (v_before->'stock'->>'nettoyage')::int = 1
         and (v_after->'stock'->>'reparation')::int - (v_before->'stock'->>'reparation')::int = 1
         and (v_after->'stock'->>'retire')::int - (v_before->'stock'->>'retire')::int = 1;

  -- O2 a ete rendue le 10/09 ; le 11 elle est encore dans son battement de
  -- nettoyage, donc bloquee pour une nouvelle reservation MAIS plus chez le
  -- client. Elle ne doit PAS gonfler le compteur « louee » du patron.
  insert into test_results
  select '7b. Piece en battement de nettoyage : pas « louee »', 'libre',
         case when (v_after->'stock'->>'louee')::int
                 - (v_before->'stock'->>'louee')::int = 1
              then 'libre' else 'COMPTEE LOUEE' end,
         (v_after->'stock'->>'louee')::int - (v_before->'stock'->>'louee')::int = 1;

  -- --- impayés --------------------------------------------------------------
  -- O1 4000 + O3 2000 + O4 7000 + O6 4000. O2 soldee, O5 annulee.
  insert into test_results
  select '10. Impayes : 4 commandes, 17000', '4 / 17000',
         ((v_after->'unpaid'->>'count')::int - (v_before->'unpaid'->>'count')::int)::text
           || ' / ' ||
         ((v_after->'unpaid'->>'total')::numeric - (v_before->'unpaid'->>'total')::numeric)::text,
         (v_after->'unpaid'->>'count')::int - (v_before->'unpaid'->>'count')::int = 4
         and (v_after->'unpaid'->>'total')::numeric - (v_before->'unpaid'->>'total')::numeric = 17000;

  -- --- graphique ------------------------------------------------------------
  insert into test_results
  select '11. Graphique : 12 seaux mensuels', '12',
         jsonb_array_length(v_after->'monthly')::text,
         jsonb_array_length(v_after->'monthly') = 12;

  -- --- reservations a venir --------------------------------------------------
  -- Ce qui explique un mois a zero. Seule O3 a un retrait posterieur au jour
  -- de reference (25/09) : O1 sort AUJOURD HUI (donc deja compte en recette),
  -- O2, O4 et O6 sont passees, O5 est annulee.
  insert into test_results
  select '13. A venir : 1 commande, 2000', '1 / 2000',
         ((v_after->'upcoming'->>'count')::int - (v_before->'upcoming'->>'count')::int)::text
           || ' / ' ||
         ((v_after->'upcoming'->>'total')::numeric - (v_before->'upcoming'->>'total')::numeric)::text,
         (v_after->'upcoming'->>'count')::int - (v_before->'upcoming'->>'count')::int = 1
         and (v_after->'upcoming'->>'total')::numeric
             - (v_before->'upcoming'->>'total')::numeric = 2000;

  insert into test_results
  select '12. Seau 2025-11 (annee precedente) present', 'present',
         coalesce((select 'present' from jsonb_array_elements(v_after->'monthly') m
                   where m->>'month' = '2025-11'), 'ABSENT'),
         exists (select 1 from jsonb_array_elements(v_after->'monthly') m
                 where m->>'month' = '2025-11');
end $$;

select case when ok then 'OK  ' else 'ECHEC' end as resultat, step, attendu, obtenu
from test_results order by lpad(split_part(step, '.', 1), 3, '0');

select count(*) filter (where ok) || '/' || count(*) || ' tests reussis' as bilan,
       case when count(*) filter (where not ok) = 0
            then 'TOUT PASSE' else 'DES TESTS ECHOUENT' end as verdict
from test_results;

rollback;
