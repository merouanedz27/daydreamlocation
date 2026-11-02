-- =============================================================================
-- VENTE — vendre en plus de louer (on commence par les chaussures)
--
-- LA DEMANDE DU CLIENT
--
-- « Je veux aussi vendre, à commencer par les chaussures. » Le stock se
-- partage donc en deux : un modèle est pour la LOCATION ou pour la VENTE, choisi
-- à sa création. Une paire à vendre reste une PIÈCE (`article_units`) comme
-- les autres — une référence, une étiquette, une taille — et se pioche dans la
-- même commande qu'une veste louée. Une commande peut aussi ne contenir QUE
-- des ventes (client de passage).
--
-- L'IDÉE : VENDRE, C'EST BLOQUER LA PAIRE POUR TOUJOURS
--
-- Une ligne de vente reçoit la même `rental_range` qu'une location, mais SANS
-- BORNE DE FIN : `[retrait, ∞)`. La contrainte `no_double_booking` existante
-- fait alors tout le travail, sans une ligne de plus :
--   - deux plages sans fin se chevauchent toujours → une paire ne se vend
--     pas deux fois, quelles que soient les dates ;
--   - une commande annulée passe `is_active` à faux → la paire est libérée.
-- La garantie reste dans la base (règle n°5), et l'erreur 23P01 →
-- `errors.unitUnavailable` marche déjà.
--
-- LE TYPE D'UNE LIGNE NE VIENT JAMAIS DU TÉLÉPHONE
--
-- `order_lines.line_kind` est posé par le trigger d'insertion, d'après l'usage
-- du modèle de la pièce. Le JSON `p_lines` et les signatures de
-- `create_order` / `update_order` (et de leurs versions hors ligne) ne
-- changent pas : la file d'attente hors ligne continue de fonctionner.
--
-- UNE VENTE SEULE N'A RIEN À RENDRE
--
-- `orders.has_rental` (faux quand toutes les lignes sont des ventes) est tenu
-- par le trigger des totaux. Pour une telle commande, cocher « Allez Valid »
-- coche aussi le retour : la commande est terminée, et elle ne traîne jamais
-- dans « pas rentrés ».
-- =============================================================================

-- --- 1. L'usage d'un modèle ----------------------------------------------------
alter table public.article_models
  add column purpose text not null default 'location';

alter table public.article_models
  add constraint article_models_purpose_valid check (purpose in ('location', 'vente'));

create index article_models_purpose_idx on public.article_models (purpose);

comment on column public.article_models.purpose is
  'location | vente. Pour un modèle de vente, `base_price` est le PRIX DE VENTE. '
  'Figé dès qu''une de ses pièces a servi dans une commande (purpose_locked).';

-- --- 2. Le type d'une ligne ----------------------------------------------------
alter table public.order_lines
  add column line_kind text not null default 'location';

alter table public.order_lines
  add constraint order_lines_kind_valid check (line_kind in ('location', 'vente'));

-- Une vente est toujours une pièce du stock : un vêtement nommé ou sous-loué
-- ne se vend pas.
alter table public.order_lines
  add constraint order_lines_sale_is_stock check (line_kind = 'location' or unit_id is not null);

-- Les ventes se cherchent souvent seules : « cette paire est-elle vendue ? »,
-- recette des ventes du tableau de bord.
create index order_lines_sale_unit_idx on public.order_lines (unit_id)
  where line_kind = 'vente' and is_active;

comment on column public.order_lines.line_kind is
  'location | vente. Posé par trigger d''après article_models.purpose, jamais par le client. '
  'Une vente bloque sa pièce sans fin : rental_range = [retrait, ∞).';

-- --- 3. La plage bloquée selon le type -----------------------------------------
create or replace function private.line_range_for(
  p_kind text,
  p_pickup date,
  p_return_due date
)
returns daterange
language sql
stable
set search_path = ''
as $$
  select case
    when p_kind = 'vente' then daterange(p_pickup, null, '[)')
    else private.rental_range_for(p_pickup, p_return_due)
  end;
$$;

revoke all on function private.line_range_for(text, date, date) from public, anon;
grant execute on function private.line_range_for(text, date, date) to authenticated;

-- À l'insertion d'une ligne : son type d'après la pièce, puis sa plage.
create or replace function public.order_lines_sync_range()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id = new.order_id;

  if new.unit_id is null then
    new.line_kind := 'location';
  else
    select m.purpose into new.line_kind
    from public.article_units u
    join public.article_models m on m.id = u.model_id
    where u.id = new.unit_id;
  end if;

  new.rental_range := private.line_range_for(
    new.line_kind, v_order.pickup_date, v_order.return_due_date
  );
  new.is_active := private.order_blocks_stock(v_order.status);

  return new;
end;
$$;

-- Le trigger existant se déclenchait sur `order_id` seul : il doit aussi
-- voir un changement de pièce.
drop trigger order_lines_sync_range_trg on public.order_lines;
create trigger order_lines_sync_range_trg
  before insert or update of order_id, unit_id on public.order_lines
  for each row
  execute function public.order_lines_sync_range();

-- Dates ou statut de la commande changés : chaque ligne selon son type.
create or replace function public.orders_propagate_to_lines()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.pickup_date is distinct from old.pickup_date
     or new.return_due_date is distinct from old.return_due_date
     or new.status is distinct from old.status
  then
    update public.order_lines
    set rental_range = private.line_range_for(
          line_kind, new.pickup_date, new.return_due_date
        ),
        is_active = private.order_blocks_stock(new.status)
    where order_id = new.id;
  end if;

  return null;
end;
$$;

-- --- 4. Une commande a-t-elle quelque chose à rendre ? -------------------------
alter table public.orders
  add column has_rental boolean not null default true;

comment on column public.orders.has_rental is
  'Faux quand toutes les lignes sont des ventes (vente seule) : rien à rendre, pas de « Retour Val ». '
  'Tenu par le trigger orders_recompute_totals.';

create or replace function public.orders_recompute_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id bigint := coalesce(new.order_id, old.order_id);
  v_subtotal numeric(12, 2);
  v_has_rental boolean;
begin
  select coalesce(sum(unit_price), 0),
         -- Une commande vide reste « location » : c'est le cas normal.
         coalesce(bool_or(line_kind = 'location'), true)
    into v_subtotal, v_has_rental
  from public.order_lines
  where order_id = v_order_id;

  update public.orders
  set subtotal = v_subtotal,
      total_price = greatest(v_subtotal - discount, 0),
      has_rental = v_has_rental
  where id = v_order_id
    and (subtotal is distinct from v_subtotal
         or total_price is distinct from greatest(v_subtotal - discount, 0)
         or has_rental is distinct from v_has_rental);

  return null;
end;
$$;

-- Les lignes existantes ont toutes été créées avant la vente : `has_rental`
-- vaut déjà vrai partout, rien à reprendre.

-- --- 5. Vente seule : « Allez Valid » termine la commande ----------------------
create or replace function public.orders_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();

  if new.discount is distinct from old.discount
     or new.subtotal is distinct from old.subtotal
  then
    new.total_price := greatest(new.subtotal - new.discount, 0);
  end if;

  -- Une vente seule n'a rien à rendre : le retour suit le retrait. Fait
  -- AVANT la dérivation du statut, qui voit donc les deux cases cochées.
  if not new.has_rental then
    new.returned := new.picked_up;
  end if;

  -- -------------------------------------------------------------------------
  -- Les deux cases viennent de bouger : on en déduit le reste.
  -- -------------------------------------------------------------------------
  if new.picked_up is distinct from old.picked_up
     or new.returned is distinct from old.returned
  then
    -- Une commande ANNULÉE reste annulée. Voir 20260912140000_order_checks.
    if old.status <> 'annulee' then
      new.status := private.order_status_from_flags(new.picked_up, new.returned);
    end if;

    -- Date de retour RÉELLE, à l'heure d'Alger. Voir 20260912140000_order_checks.
    if new.returned and not old.returned then
      new.actual_return_date := coalesce(
        new.actual_return_date,
        (now() at time zone 'Africa/Algiers')::date
      );
    elsif old.returned and not new.returned then
      new.actual_return_date := null;
    end if;
  end if;

  return new;
end;
$$;

-- --- 6. L'usage d'un modèle déjà commandé ne change plus -----------------------
-- Sinon les lignes passées d'une même paire diraient « louée » et « vendue »,
-- et une pièce vendue redeviendrait louable.
create or replace function private.lock_model_purpose()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.purpose is distinct from old.purpose and exists (
    select 1
    from public.order_lines ol
    join public.article_units u on u.id = ol.unit_id
    where u.model_id = new.id
  ) then
    raise exception 'purpose_locked' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function private.lock_model_purpose() from public, anon, authenticated;

create trigger article_models_lock_purpose
  before update of purpose on public.article_models
  for each row execute function private.lock_model_purpose();

-- --- 7. Un ensemble ne contient que du stock de location -----------------------
-- Un ensemble est un raccourci de LOCATION. Même message que save_ensemble
-- pour une pièce retirée : l'écran le traduit déjà.
create or replace function private.ensemble_item_is_rental()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.article_units u
    join public.article_models m on m.id = u.model_id
    where u.id = new.unit_id and m.purpose = 'vente'
  ) then
    raise exception 'ensemble_unit_invalid' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function private.ensemble_item_is_rental() from public, anon, authenticated;

create trigger ensemble_items_rental_only
  before insert or update of unit_id on public.ensemble_items
  for each row execute function private.ensemble_item_is_rental();

-- --- 8. Tableau de bord : les ventes à part ET dans les totaux ------------------
-- `revenue` reste le TOTAL (locations + ventes) : c'est la somme des
-- `total_price`. On y ajoute `sales` (la part des ventes) et `salesCost` (ce
-- que les paires vendues ont coûté), par période et par mois. L'écran en
-- déduit locations = revenue − sales et la marge des ventes.
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
-- Les ventes, ligne par ligne, rattachées au retrait comme le reste.
sale as (
  select o.pickup_date as on_date,
         ol.unit_price as amount,
         coalesce(u.purchase_price, m.purchase_price) as cost
  from public.order_lines ol
  join public.orders o on o.id = ol.order_id
  join public.article_units u on u.id = ol.unit_id
  join public.article_models m on m.id = u.model_id
  cross join bounds b
  where ol.line_kind = 'vente'
    and ol.is_active
    and o.pickup_date >= least(b.chart_from, b.y)
    and o.pickup_date <  b.next_year
),
exp as (
  select e.spent_on as on_date, e.amount
  from public.expenses e, bounds b
  where e.spent_on >= least(b.chart_from, b.y)
    and e.spent_on <  b.next_year
),
-- Une pièce VENDUE (vente active) : sortie du stock pour de bon.
sold as (
  select distinct ol.unit_id
  from public.order_lines ol
  where ol.line_kind = 'vente' and ol.is_active
),
stock as (
  select
    count(*) filter (where s.unit_id is not null)                                         as vendue,
    count(*) filter (where s.unit_id is null and u.status = 'retire')                     as retire,
    count(*) filter (where s.unit_id is null and u.status = 'reparation')                 as reparation,
    count(*) filter (where s.unit_id is null and u.status = 'nettoyage')                  as nettoyage,
    count(*) filter (where s.unit_id is null and u.status = 'disponible' and busy.rented)     as louee,
    count(*) filter (where s.unit_id is null and u.status = 'disponible' and not busy.rented) as disponible
  from public.article_units u
  left join sold s on s.unit_id = u.id
  cross join lateral (
    select exists (
      select 1
      from public.order_lines ol
      join public.orders o on o.id = ol.order_id
      where ol.unit_id = u.id
        and ol.is_active
        and ol.line_kind = 'location'
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
-- Voir 20261006140000_costumes_divisibles. Une paire vendue n'est plus au
-- stock : elle n'y compte plus.
stock_value as (
  select
    count(*)                       as pieces,
    coalesce(sum(item.price), 0)   as total
  from (
    select coalesce(max(u.purchase_price), max(m.purchase_price)) as price
    from public.article_units u
    join public.article_models m on m.id = u.model_id
    where not exists (select 1 from sold s where s.unit_id = u.id)
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

  'sales', jsonb_build_object(
    'day',   (select coalesce(sum(s.amount), 0) from sale s, bounds b
              where s.on_date = b.d),
    'week',  (select coalesce(sum(s.amount), 0) from sale s, bounds b
              where s.on_date >= b.w and s.on_date < b.w + 7),
    'month', (select coalesce(sum(s.amount), 0) from sale s, bounds b
              where date_trunc('month', s.on_date::timestamp)::date = b.m),
    'year',  (select coalesce(sum(s.amount), 0) from sale s, bounds b
              where date_trunc('year', s.on_date::timestamp)::date = b.y)
  ),

  'salesCost', jsonb_build_object(
    'day',   (select coalesce(sum(s.cost), 0) from sale s, bounds b
              where s.on_date = b.d),
    'week',  (select coalesce(sum(s.cost), 0) from sale s, bounds b
              where s.on_date >= b.w and s.on_date < b.w + 7),
    'month', (select coalesce(sum(s.cost), 0) from sale s, bounds b
              where date_trunc('month', s.on_date::timestamp)::date = b.m),
    'year',  (select coalesce(sum(s.cost), 0) from sale s, bounds b
              where date_trunc('year', s.on_date::timestamp)::date = b.y)
  ),

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
          'sales', (select coalesce(sum(s.amount), 0) from sale s
                    where date_trunc('month', s.on_date::timestamp)::date = mo.month),
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
