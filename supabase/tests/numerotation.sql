-- =============================================================================
-- Numéros de commande : continus, sans trou, jamais saisis.
--
--   node scripts/run-sql.mjs supabase/tests/numerotation.sql
--
-- Le compteur `private.order_counter` avance dans la transaction de la
-- commande : une création refusée rend son numéro. Le script se termine par
-- rollback.
--
-- LIMITE : ce test passe par une connexion directe, sans `pg-safeupdate`
-- (chargé par Supabase pour les seules requêtes de l'API). Un UPDATE sans
-- WHERE y passe, alors que l'application le voit refusé : voir
-- 20261103203600_compteur_commandes_where.sql.
-- =============================================================================

begin;

create temp table test_results (
  step text, attendu text, obtenu text, ok boolean
) on commit drop;

do $$
declare
  v_last  integer := (select last_no from private.order_counter);
  v_next  text := 'CMD-' || lpad((v_last + 1)::text, 5, '0');
  v_next2 text := 'CMD-' || lpad((v_last + 2)::text, 5, '0');
  v_no    text;
  v_dup   integer;
begin
  select count(*) - count(distinct order_no) into v_dup from public.orders;
  insert into test_results values ('1. Aucun numéro en double', '0', v_dup::text, v_dup = 0);

  insert into test_results
  select '2. Le compteur égale le plus grand numéro', v_last::text,
         coalesce(max(substr(order_no, 5)::integer), 0)::text,
         coalesce(max(substr(order_no, 5)::integer), 0) = v_last
  from public.orders;

  insert into public.orders (customer_name, event_date, order_no)
  values ('ZZN A', '2031-06-10', 'CMD-99999') returning order_no into v_no;
  insert into test_results values ('3. Numéro suivant, celui fourni ignoré', v_next, v_no, v_no = v_next);

  -- Une création qui échoue (sous-transaction annulée) rend son numéro.
  begin
    insert into public.orders (customer_name, event_date) values ('ZZN B', '2031-06-10');
    raise exception 'annule';
  exception when others then
    null;
  end;

  insert into public.orders (customer_name, event_date)
  values ('ZZN C', '2031-06-10') returning order_no into v_no;
  insert into test_results values ('4. Un échec ne laisse pas de trou', v_next2, v_no, v_no = v_next2);
end;
$$;

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
