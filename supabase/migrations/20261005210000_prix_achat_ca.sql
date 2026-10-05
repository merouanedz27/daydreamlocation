-- =============================================================================
-- Prix d'achat des modèles, et chiffre d'affaires = valeur d'achat du stock
--
-- LA DEMANDE DU CLIENT
--
-- « Le chiffre d'affaires, c'est la somme des prix des pièces achetées : 5
-- pièces à 110 000, c'est 550 000. Le bénéfice, c'est le prix de location de
-- toutes les commandes moins les frais. »
--
-- Un modèle porte donc DEUX prix :
--   - `base_price`     : prix de LOCATION, qui remplit le prix des commandes
--                        (donc le bénéfice) ;
--   - `purchase_price` : prix d'ACHAT d'une pièce, qui fait le chiffre
--                        d'affaires. `article_units.purchase_price` existait
--                        déjà : il reste l'exception pièce par pièce.
--
-- `dashboard_stats` gagne `stockValue` : le total, sans date (le client l'a
-- voulu ainsi), pièces retirées comprises. Les recettes de location par
-- période, les frais et le bénéfice ne changent pas.
-- =============================================================================

alter table public.article_models
  add column if not exists purchase_price numeric(12, 2) not null default 0;

alter table public.article_models
  drop constraint if exists article_models_purchase_price_check;
alter table public.article_models
  add constraint article_models_purchase_price_check check (purchase_price >= 0);

comment on column public.article_models.purchase_price is
  'Prix d''achat d''UNE pièce de ce modèle. La somme sur les pièces fait le chiffre d''affaires du tableau de bord.';

create or replace function public.dashboard_stats(p_today date default current_date)
returns jsonb
language sql
security invoker
stable
set search_path = ''
as $$
with bounds as (
  select
    p_today                                                                as d,
    date_trunc('week',  p_today::timestamp)::date                          as w,
    date_trunc('month', p_today::timestamp)::date                          as m,
    date_trunc('year',  p_today::timestamp)::date                          as y,
    (date_trunc('month', p_today::timestamp) - interval '11 months')::date as chart_from,
    (date_trunc('year',  p_today::timestamp) + interval '1 year')::date    as next_year
),
-- 12 seaux mensuels, y compris les mois SANS activité : un trou dans un
-- graphique se lit comme une donnée manquante, pas comme un zéro.
months as (
  select generate_series(
           (select chart_from from bounds),
           (select m from bounds),
           interval '1 month')::date as month
),
-- La recette est rattachée au RETRAIT (décision v1), et une commande annulée
-- n'est pas une recette. La caution n'apparaît nulle part ici : elle est
-- détenue, pas gagnée.
rev as (
  select o.pickup_date as on_date, o.total_price as amount
  from public.orders o, bounds b
  where o.status <> 'annulee'
    and o.pickup_date >= least(b.chart_from, b.y)
    and o.pickup_date <  b.next_year
),
exp as (
  select e.spent_on as on_date, e.amount
  from public.expenses e, bounds b
  where e.spent_on >= least(b.chart_from, b.y)
    and e.spent_on <  b.next_year
),
-- « Louée » n'est PAS un statut. `article_units.status` décrit l'état MATÉRIEL
-- de la pièce ; une veste partie en location ce week-end est toujours
-- « disponible » au sens du stock. La location se déduit des commandes. Les
-- compter comme disponibles gonflerait le stock libre — exactement l'erreur
-- que le tableur commettait.
--
-- ON N'UTILISE PAS `rental_range` ICI, et c'est délibéré. Cette plage inclut
-- le battement de NETTOYAGE : une veste rendue hier y figure encore
-- aujourd'hui. Elle est parfaitement juste pour REFUSER une réservation, mais
-- la compter comme « louée » afficherait au patron un costume de plus chez un
-- client qu'il n'y en a réellement. On lit donc les dates de la COMMANDE :
-- « louée » = physiquement sortie. Une pièce dans son battement retombe en
-- « disponible » — elle est bien sur son cintre, simplement pas relouable
-- avant demain.
--
-- Les cinq seaux sont MUTUELLEMENT EXCLUSIFS : leur somme fait le stock total.
stock as (
  select
    count(*) filter (where u.status = 'retire')                          as retire,
    count(*) filter (where u.status = 'reparation')                      as reparation,
    count(*) filter (where u.status = 'nettoyage')                       as nettoyage,
    count(*) filter (where u.status = 'disponible' and busy.rented)      as louee,
    count(*) filter (where u.status = 'disponible' and not busy.rented)  as disponible
  from public.article_units u
  cross join lateral (
    select exists (
      select 1
      from public.order_lines ol
      join public.orders o on o.id = ol.order_id
      where ol.unit_id = u.id
        and ol.is_active
        and o.pickup_date <= p_today
        and p_today <= o.return_due_date
    ) as rented
  ) busy
),
unpaid as (
  select count(*) as n, coalesce(sum(o.balance), 0) as total
  from public.orders o
  where o.status <> 'annulee' and o.balance > 0
),
-- Réservé, pas encore sorti. Sans borne de fin : un mariage de l'an prochain
-- est réservé pour de bon. `next_date` est un RETRAIT, comme la recette — les
-- deux doivent parler de la même date, sinon l'explication du zéro désigne un
-- jour qui ne correspond à rien dans les cartes du dessus.
-- Le CHIFFRE D'AFFAIRES au sens du propriétaire : ce que le stock a coûté.
-- Chaque pièce compte pour son prix d'achat (le sien, sinon celui de son
-- modèle), y compris les pièces RETIRÉES : l'argent a bien été dépensé. Seule
-- une pièce effacée (saisie par erreur) en sort. Aucune date : c'est un total.
stock_value as (
  select
    count(*)                                                  as pieces,
    coalesce(sum(coalesce(u.purchase_price, m.purchase_price)), 0) as total
  from public.article_units u
  join public.article_models m on m.id = u.model_id
),
upcoming as (
  select
    count(*)                        as n,
    coalesce(sum(o.total_price), 0) as total,
    min(o.pickup_date)              as next_date
  from public.orders o
  where o.status <> 'annulee'
    and o.pickup_date > p_today
)
select jsonb_build_object(
  'today', p_today,

  'revenue', jsonb_build_object(
    'day',   (select coalesce(sum(r.amount), 0) from rev r, bounds b
              where r.on_date = b.d),
    'week',  (select coalesce(sum(r.amount), 0) from rev r, bounds b
              where r.on_date >= b.w and r.on_date < b.w + 7),
    'month', (select coalesce(sum(r.amount), 0) from rev r, bounds b
              where date_trunc('month', r.on_date::timestamp)::date = b.m),
    'year',  (select coalesce(sum(r.amount), 0) from rev r, bounds b
              where date_trunc('year', r.on_date::timestamp)::date = b.y)
  ),

  'expenses', jsonb_build_object(
    'day',   (select coalesce(sum(e.amount), 0) from exp e, bounds b
              where e.on_date = b.d),
    'week',  (select coalesce(sum(e.amount), 0) from exp e, bounds b
              where e.on_date >= b.w and e.on_date < b.w + 7),
    'month', (select coalesce(sum(e.amount), 0) from exp e, bounds b
              where date_trunc('month', e.on_date::timestamp)::date = b.m),
    'year',  (select coalesce(sum(e.amount), 0) from exp e, bounds b
              where date_trunc('year', e.on_date::timestamp)::date = b.y)
  ),

  'monthly', (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'month', to_char(mo.month, 'YYYY-MM'),
          'revenue', (select coalesce(sum(r.amount), 0) from rev r
                      where date_trunc('month', r.on_date::timestamp)::date = mo.month),
          'expenses', (select coalesce(sum(e.amount), 0) from exp e
                       where date_trunc('month', e.on_date::timestamp)::date = mo.month)
        )
        order by mo.month
      ), '[]'::jsonb)
    from months mo
  ),

  'stock', (select to_jsonb(s) from stock s),

  'unpaid', (select jsonb_build_object('count', u.n, 'total', u.total) from unpaid u),

  'stockValue', (select jsonb_build_object('pieces', sv.pieces, 'total', sv.total)
                 from stock_value sv),

  'upcoming', (select jsonb_build_object(
                 'count', up.n, 'total', up.total, 'nextDate', up.next_date)
               from upcoming up)
);
$$;

comment on function public.dashboard_stats is
  'Chiffres du tableau de bord en un appel : chiffre d''affaires = valeur '
  'd''achat du stock (`stockValue`, sans date, pièces retirées comprises), '
  'recettes de location et frais sur quatre périodes calendaires (le bénéfice '
  'en découle), 12 mois d''historique, état du stock, impayés, réservations à '
  'venir. Les locations suivent `pickup_date`, excluent les annulées et '
  'n''incluent jamais la caution.';

revoke all on function public.dashboard_stats(date) from public, anon;
grant execute on function public.dashboard_stats(date) to authenticated;
