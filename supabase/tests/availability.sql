-- =============================================================================
-- Vérification du moteur de disponibilité
--
-- À exécuter APRÈS les migrations. Le script s'annule entièrement (rollback) :
-- il ne laisse aucune donnée derrière lui.
--
-- Il prouve la seule chose qui compte vraiment dans cette application :
-- une pièce déjà louée ne peut pas être relouée sur des dates qui se
-- chevauchent, et c'est POSTGRES qui refuse — pas le code applicatif.
-- =============================================================================

begin;

-- --- jeu d'essai ------------------------------------------------------------
insert into public.article_models (ref_code, name_fr, category_id, base_price)
values ('TEST-Gio-079', 'Veste de test', (select id from public.categories where slug = 'veste'), 3000);

insert into public.article_units (model_id, ref_code, size)
select id, 'TEST-Gio-079-01', '50' from public.article_models where ref_code = 'TEST-Gio-079';

insert into public.article_units (model_id, ref_code, size)
select id, 'TEST-Gio-079-02', '50' from public.article_models where ref_code = 'TEST-Gio-079';

-- Commande 1 : mariage du 26/08. Retrait le 25, retour le 27 (défauts).
insert into public.orders (customer_name, event_date)
values ('Hafid', '2026-08-26');

insert into public.order_lines (order_id, unit_id, unit_price)
select o.id, u.id, 3000
from public.orders o, public.article_units u
where o.customer_name = 'Hafid' and u.ref_code = 'TEST-Gio-079-01';

\echo ''
\echo '=== 1. fenêtre déduite d une seule date d événement ==='
select event_date, pickup_date, return_due_date
from public.orders where customer_name = 'Hafid';

\echo ''
\echo '=== 2. plage réellement bloquée (retour + battement nettoyage) ==='
select l.rental_range, l.is_active
from public.order_lines l
join public.orders o on o.id = l.order_id
where o.customer_name = 'Hafid';

\echo ''
\echo '=== 3. totaux recalculés depuis les lignes ==='
select total_price, amount_paid, balance from public.orders where customer_name = 'Hafid';

-- --- LE test ----------------------------------------------------------------
\echo ''
\echo '=== 4. MÊME pièce, dates qui se chevauchent -> doit ÉCHOUER (23P01) ==='
insert into public.orders (customer_name, event_date) values ('Zohir', '2026-08-27');

savepoint avant_conflit;
do $$
begin
  insert into public.order_lines (order_id, unit_id, unit_price)
  select o.id, u.id, 3000
  from public.orders o, public.article_units u
  where o.customer_name = 'Zohir' and u.ref_code = 'TEST-Gio-079-01';

  raise exception 'ECHEC DU TEST : la double-reservation a ete acceptee';
exception
  when exclusion_violation then
    raise notice 'OK -> Postgres a refuse la double-reservation (SQLSTATE 23P01)';
end $$;
rollback to savepoint avant_conflit;

\echo ''
\echo '=== 5. AUTRE exemplaire, même taille, mêmes dates -> doit RÉUSSIR ==='
insert into public.order_lines (order_id, unit_id, unit_price)
select o.id, u.id, 3000
from public.orders o, public.article_units u
where o.customer_name = 'Zohir' and u.ref_code = 'TEST-Gio-079-02';
\echo 'OK -> le second exemplaire est bien louable'

\echo ''
\echo '=== 6. annuler la commande 1 libère la pièce ==='
update public.orders set status = 'annulee' where customer_name = 'Hafid';

insert into public.order_lines (order_id, unit_id, unit_price)
select o.id, u.id, 3000
from public.orders o, public.article_units u
where o.customer_name = 'Zohir' and u.ref_code = 'TEST-Gio-079-01';
\echo 'OK -> piece liberee par l annulation, relouable'

\echo ''
\echo '=== 7. pièce sous-louée chez un confrère (FETHI LOC) -> pas de blocage ==='
insert into public.order_lines (order_id, external_source, external_label, external_cost, unit_price)
select id, 'Fethi', 'Veste taille 60', 1500, 4000
from public.orders where customer_name = 'Zohir';
\echo 'OK -> ligne externe acceptee sans unit_id'

\echo ''
\echo '=== 8. décaler une commande sur un créneau déjà pris -> doit ÉCHOUER ==='
insert into public.orders (customer_name, event_date) values ('Karim', '2026-12-25');
insert into public.order_lines (order_id, unit_id, unit_price)
select o.id, u.id, 3000
from public.orders o, public.article_units u
where o.customer_name = 'Karim' and u.ref_code = 'TEST-Gio-079-02';

savepoint avant_decalage;
do $$
begin
  update public.orders set event_date = '2026-08-27',
                           pickup_date = '2026-08-26',
                           return_due_date = '2026-08-28'
  where customer_name = 'Karim';

  raise exception 'ECHEC DU TEST : le decalage vers un creneau pris a ete accepte';
exception
  when exclusion_violation then
    raise notice 'OK -> un decalage de dates est verifie comme une reservation';
end $$;
rollback to savepoint avant_decalage;

\echo ''
\echo '=== 9. balance est bien une colonne generee (non ecrivable) ==='
do $$
begin
  update public.orders set balance = 999 where customer_name = 'Zohir';
  raise exception 'ECHEC DU TEST : balance a pu etre ecrite';
exception
  when generated_always then
    raise notice 'OK -> balance est calculee, non saisissable';
end $$;

rollback;

\echo ''
\echo '=== Tous les tests termines. Aucune donnee laissee en base (rollback). ==='
