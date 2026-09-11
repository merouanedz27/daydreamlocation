-- =============================================================================
-- dashboard_stats — tous les chiffres du tableau de bord en UN appel
--
-- POURQUOI EN SQL ET PAS EN JAVASCRIPT
--
-- Deux raisons, et aucune n'est le confort :
--   1. PostgREST plafonne les réponses à 1 000 lignes SANS LE DIRE. Sommer
--      côté navigateur donnerait donc des totaux silencieusement faux le jour
--      où la boutique dépasse ce volume — le pire mode de panne pour un
--      chiffre d'affaires.
--   2. `total_price` est un numeric(12,2). Le sommer dans des `Number`
--      JavaScript introduit des dérives de centimes sur des montants que le
--      patron va comparer aux siens, ligne à ligne.
--
-- `security invoker` : la RLS fait le tri toute seule. `expenses` étant
-- réservée au propriétaire, un `staff` qui appellerait cette fonction verrait
-- simplement 0 en dépenses — pas une erreur, pas une fuite.
--
-- CONVENTION DE PÉRIODE : les quatre périodes sont des périodes CALENDAIRES
-- COMPLÈTES (la semaine entière lundi→dimanche, le mois entier, l'année
-- entière), pas des « depuis le début de la période jusqu'à aujourd'hui ».
-- C'est ainsi que le client lit son tableur, découpé par mois : il somme la
-- colonne PRIX du mois, pas du mois jusqu'à ce jour. Les commandes déjà
-- réservées plus tard dans la période comptent donc.
-- =============================================================================

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
-- « Louée » n'est PAS un statut. `article_units.status` décrit l'état
-- MATÉRIEL de la pièce ; une veste partie en location ce week-end est
-- toujours « disponible » au sens du stock. La location se déduit des
-- commandes. Les compter comme disponibles gonflerait le stock libre —
-- exactement l'erreur que le tableur commettait.
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

  'unpaid', (select jsonb_build_object('count', u.n, 'total', u.total) from unpaid u)
);
$$;

comment on function public.dashboard_stats is
  'Chiffres du tableau de bord en un appel : recettes et dépenses sur quatre '
  'périodes calendaires, 12 mois d''historique, état du stock et impayés. '
  'La recette suit `pickup_date`, exclut les commandes annulées, et n''inclut '
  'JAMAIS la caution (détenue, pas gagnée).';

revoke all on function public.dashboard_stats(date) from public, anon;
grant execute on function public.dashboard_stats(date) to authenticated;
