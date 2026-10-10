-- =============================================================================
-- La CAISSE du jour : journal des paiements
--
-- Le patron suit sa caisse au jour le jour. Pour lui, l'entrée d'argent du
-- jour = les VERSEMENTS (acomptes pris à la réservation) + les RESTES (soldés
-- par les clients qui n'avaient pas tout payé, bouton « Encaisser »).
--
-- `orders.amount_paid` n'est qu'un cumul, sans date : impossible d'en tirer
-- « ce qui est entré aujourd'hui ». D'où `order_payments`, un mouvement par
-- changement du montant versé, avec son jour (heure d'Alger) et sa nature.
--
-- Il est tenu par un TRIGGER sur `orders`, pas par le JavaScript : tous les
-- chemins qui écrivent `amount_paid` (création, modification, encaissement)
-- passent par lui, sans qu'aucune fonction change de signature.
--   - création avec acompte               → versement
--   - modification de l'acompte (update)  → versement (la différence)
--   - add_order_payment (« Encaisser »)   → reste
-- Un montant négatif est une correction, comme dans add_order_payment.
--
-- Le journal commence à l'installation : les jours d'avant restent inconnus.
-- =============================================================================

-- --- 1. Le journal -----------------------------------------------------------
create table public.order_payments (
  id         bigint generated always as identity primary key,
  order_id   bigint not null references public.orders (id) on delete cascade,
  amount     numeric(12, 2) not null,
  kind       text not null check (kind in ('versement', 'reste')),
  paid_on    date not null default ((now() at time zone 'Africa/Algiers')::date),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

comment on table public.order_payments is
  'Chaque mouvement de orders.amount_paid, daté (heure d''Alger) : versement '
  '(acompte) ou reste (solde encaissé). Écrit par le trigger '
  'orders_log_payment seulement. Sert la caisse du jour du tableau de bord.';

create index order_payments_paid_on_idx on public.order_payments (paid_on);
create index order_payments_order_id_idx on public.order_payments (order_id);

alter table public.order_payments enable row level security;

-- Lecture : le propriétaire (tableau de bord). Aucune policy d'écriture : seul
-- le trigger, `security definer`, y insère.
create policy order_payments_owner_select on public.order_payments
  for select to authenticated
  using ((select private.is_owner()));

-- --- 2. Le trigger -----------------------------------------------------------
create or replace function private.log_order_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delta numeric;
begin
  if tg_op = 'INSERT' then
    v_delta := new.amount_paid;
  else
    v_delta := new.amount_paid - old.amount_paid;
  end if;

  if v_delta is null or v_delta = 0 then
    return null;
  end if;

  insert into public.order_payments (order_id, amount, kind)
  values (
    new.id,
    v_delta,
    case when tg_op = 'UPDATE'
          and current_setting('daydream.payment_kind', true) = 'reste'
         then 'reste' else 'versement' end
  );
  return null;
end;
$$;

revoke all on function private.log_order_payment() from public, anon, authenticated;

create trigger orders_log_payment
  after insert or update of amount_paid on public.orders
  for each row execute function private.log_order_payment();

-- --- 2 bis. Le jour de l'installation ----------------------------------------
-- Les commandes créées AUJOURD'HUI avant cette migration ont leur acompte dans
-- `amount_paid` mais pas dans le journal : on le reprend comme versement du
-- jour, pour que la première caisse ne soit pas fausse. Les jours d'avant
-- restent inconnus (on ne sait pas quand leurs restes ont été encaissés).
insert into public.order_payments (order_id, amount, kind, paid_on, created_by, created_at)
select o.id, o.amount_paid, 'versement',
       (o.created_at at time zone 'Africa/Algiers')::date, o.created_by, o.created_at
from public.orders o
where o.amount_paid > 0
  and (o.created_at at time zone 'Africa/Algiers')::date
      = (now() at time zone 'Africa/Algiers')::date;

-- --- 3. « Encaisser » marque son mouvement comme un reste ----------------------
create or replace function public.add_order_payment(
  p_order_id bigint,
  p_amount   numeric
)
returns numeric
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status  text;
  v_paid    numeric;
  v_balance numeric;
begin
  if p_amount is null or p_amount = 0 then
    raise exception 'payment_zero' using errcode = '22023';
  end if;

  -- Lecture PRÉALABLE dans le seul but de rendre un message utilisable :
  -- « commande annulée » se corrige, « violation de contrainte 23514 » non.
  -- Elle ne garantit rien par elle-même (la ligne peut changer entre les deux
  -- instructions) — la garantie vient de l'UPDATE atomique ci-dessous et de la
  -- contrainte `orders_amounts_positive`.
  select o.status, o.amount_paid into v_status, v_paid
  from public.orders o
  where o.id = p_order_id;

  if not found then
    raise exception 'payment_order_not_found' using errcode = 'P0002';
  end if;

  -- Une commande annulée n'encaisse plus rien : elle est sortie du chiffre
  -- d'affaires. La remettre en service d'abord, puis encaisser.
  if v_status = 'annulee' then
    raise exception 'payment_on_cancelled' using errcode = '22023';
  end if;

  if v_paid + p_amount < 0 then
    raise exception 'payment_too_large' using errcode = '22023';
  end if;

  -- Ce qui suit est le RESTE que le client solde : le journal des paiements
  -- (`private.log_order_payment`) le range comme tel. Local à la transaction.
  perform set_config('daydream.payment_kind', 'reste', true);

  -- L'incrément, lui, est atomique : deux encaissements simultanés
  -- s'additionnent au lieu de s'écraser.
  update public.orders
     set amount_paid = amount_paid + p_amount
   where id = p_order_id
  returning balance into v_balance;

  return v_balance;
end;
$$;

comment on function public.add_order_payment is
  'Ajoute un versement (montant POSITIF) ou corrige une saisie (montant '
  'NÉGATIF) sur une commande, et rend le nouveau reste dû. L''incrément est '
  'fait en base : deux téléphones qui encaissent en même temps ne peuvent pas '
  's''écraser.';

revoke all on function public.add_order_payment(bigint, numeric) from public, anon;
-- `staff` encaisse : c'est le métier quotidien du comptoir. La RLS
-- (`orders_update`) reste la seule autorité — `security invoker` l'applique.
grant execute on function public.add_order_payment(bigint, numeric) to authenticated;

-- --- 4. Le tableau de bord lit la caisse du jour ----------------------------
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
months as (
  select generate_series(
           (select chart_from from bounds),
           (select m from bounds),
           interval '1 month')::date as month
),
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
-- État du stock, par PIÈCE PHYSIQUE : un costume dont seul le pantalon est
-- sorti compte une pièce louée et une disponible. Voir la migration
-- 20261005210000 pour le reste du raisonnement (« louée » = dates de la
-- commande, pas `rental_range`).
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
-- Le CHIFFRE D'AFFAIRES au sens du propriétaire : ce que le stock a coûté.
-- On compte des ARTICLES ACHETÉS : un costume (toutes ses parties) compte UNE
-- fois, au prix d'achat de son modèle — l'avoir découpé en veste et pantalon
-- ne double pas ce qu'il a coûté. Une pièce simple compte pour elle-même.
stock_value as (
  select
    count(*)                       as pieces,
    coalesce(sum(item.price), 0)   as total
  from (
    select coalesce(max(u.purchase_price), max(m.purchase_price)) as price
    from public.article_units u
    join public.article_models m on m.id = u.model_id
    group by coalesce(u.set_ref, u.id::text)
  ) item
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

  -- La CAISSE du jour, lue dans le journal des paiements : les acomptes
  -- pris aujourd'hui (versement) et les restes soldés aujourd'hui (reste),
  -- sur n'importe quelle commande. `since` : premier jour journalisé.
  'cash', jsonb_build_object(
    'versement', (select coalesce(sum(p.amount), 0) from public.order_payments p
                  where p.paid_on = p_today and p.kind = 'versement'),
    'reste',     (select coalesce(sum(p.amount), 0) from public.order_payments p
                  where p.paid_on = p_today and p.kind = 'reste'),
    'since',     (select min(p.paid_on) from public.order_payments p)
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

revoke all on function public.dashboard_stats(date) from public, anon;
grant execute on function public.dashboard_stats(date) to authenticated;
