-- =============================================================================
-- Costumes DIVISIBLES : un costume se loue entier, ou pièce par pièce
--
-- LA DEMANDE DU CLIENT
--
-- « Un client peut prendre le pantalon d'un costume et la veste d'un autre. »
--
-- La base sait déjà le faire : la disponibilité se calcule par PIÈCE physique
-- (`order_lines` + la contrainte EXCLUDE). Mais l'import du stock a créé les
-- costumes (Tuxedos, Invités) avec UNE pièce par costume — veste et pantalon
-- ensemble. Louer le seul pantalon de TUX-A-03 était impossible.
--
-- LE MODÈLE
--
-- Un costume devient un JEU de pièces réelles :
--   - le modèle déclare ses parties (`article_model_parts`) — Tuxedo : veste +
--     pantalon + gilet ; Invité : veste + pantalon — avec le prix de location
--     de chaque partie louée SEULE. `base_price` reste le prix du costume
--     COMPLET ;
--   - chaque partie est une `article_units` ordinaire, avec sa taille, son
--     statut, son pressing, ses réservations. `set_ref` (« TUX-A-03 ») regroupe
--     les parties d'un même costume ; `part` dit laquelle c'est.
--
-- Rien ne change pour la disponibilité : louer le costume complet, c'est
-- réserver chacune de ses parties ; la contrainte EXCLUDE veille sur chacune.
-- Chemises, chaussures, blighas et burnous restent des pièces simples.
-- =============================================================================

-- --- 1. Les parties d'un modèle ---------------------------------------------
create table public.article_model_parts (
  model_id   bigint not null references public.article_models (id) on delete cascade,
  part       text not null,
  rent_price numeric(12, 2) not null default 0,
  position   smallint not null default 0,
  primary key (model_id, part),
  constraint article_model_parts_part_valid check (part in ('veste', 'pantalon', 'gilet')),
  constraint article_model_parts_price_positive check (rent_price >= 0)
);

comment on table public.article_model_parts is
  'Parties d''un modèle de costume divisible, et prix de location de chacune louée SEULE. Le costume complet se loue au `base_price` du modèle.';

alter table public.article_model_parts enable row level security;

create policy article_model_parts_read on public.article_model_parts
  for select to authenticated using ((select private.is_staff()));
create policy article_model_parts_insert on public.article_model_parts
  for insert to authenticated with check ((select private.can_manage_stock()));
create policy article_model_parts_update on public.article_model_parts
  for update to authenticated
  using ((select private.can_manage_stock())) with check ((select private.can_manage_stock()));
create policy article_model_parts_delete on public.article_model_parts
  for delete to authenticated using ((select private.can_manage_stock()));

-- --- 2. La pièce sait de quel costume elle est, et quelle partie ------------
alter table public.article_units
  add column set_ref text,
  add column part text,
  add constraint article_units_part_valid
    check (part is null or part in ('veste', 'pantalon', 'gilet')),
  add constraint article_units_set_part_together
    check ((set_ref is null) = (part is null));

comment on column public.article_units.set_ref is
  'Code du costume dont cette pièce est une partie (« TUX-A-03 »). NULL pour une pièce simple.';
comment on column public.article_units.part is
  'veste / pantalon / gilet — la partie du costume `set_ref`. NULL pour une pièce simple.';

create unique index article_units_set_part_key
  on public.article_units (set_ref, part) where set_ref is not null;

-- --- 3. Découpage des costumes existants -------------------------------------
-- Chaque modèle `costume` : veste + pantalon (le gilet s'ajoute ensuite sur
-- les modèles qui en ont un). Prix des parties à 0 : le patron les saisit.
insert into public.article_model_parts (model_id, part, rent_price, position)
select m.id, p.part, 0, p.position
from public.article_models m
join public.categories c on c.id = m.category_id and c.slug = 'costume'
cross join (values ('veste', 1), ('pantalon', 2)) as p (part, position)
on conflict do nothing;

-- La pièce existante GARDE son id (son historique de commandes la suit) et
-- devient la veste ; un pantalon frère naît avec la même taille et le même
-- état.
create temporary table _costume_split on commit drop as
select u.id as veste_id, u.ref_code as set_ref
from public.article_units u
join public.article_models m on m.id = u.model_id
join public.categories c on c.id = m.category_id and c.slug = 'costume'
where u.set_ref is null;

update public.article_units u
set set_ref = s.set_ref,
    part = 'veste',
    ref_code = s.set_ref || '-V'
from _costume_split s
where u.id = s.veste_id;

insert into public.article_units (
  model_id, ref_code, size, length_cm, price_override, purchase_price, purchase_date,
  condition, status, status_since, notes, set_ref, part
)
select u.model_id, s.set_ref || '-P', u.size, null, null, null, u.purchase_date,
       u.condition, u.status, u.status_since, null, s.set_ref, 'pantalon'
from _costume_split s
join public.article_units u on u.id = s.veste_id;

-- Commandes existantes : une location du costume entier réservait les deux
-- parties. Le pantalon reçoit une ligne sœur (prix 0 : le prix reste sur la
-- ligne d'origine), pour rester bloqué aux mêmes dates.
insert into public.order_lines (
  order_id, unit_id, unit_price, line_note, model_name_snapshot, size_snapshot
)
select ol.order_id, p.id, 0, null,
       coalesce(ol.model_name_snapshot, m.name_fr) || ' · Pantalon', ol.size_snapshot
from public.order_lines ol
join _costume_split s on s.veste_id = ol.unit_id
join public.article_units p on p.set_ref = s.set_ref and p.part = 'pantalon'
join public.article_models m on m.id = p.model_id;

update public.order_lines ol
set model_name_snapshot = coalesce(ol.model_name_snapshot, m.name_fr) || ' · Veste'
from _costume_split s, public.article_units u, public.article_models m
where ol.unit_id = s.veste_id and u.id = ol.unit_id and m.id = u.model_id;

-- --- 4. Les lignes de commande nomment la partie -----------------------------
create or replace function private.insert_order_lines(p_order_id bigint, p_lines jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_line jsonb;
  v_unit_id bigint;
  v_ref text;
  v_model_name text;
  v_size text;
  v_part text;
  v_label text;
begin
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_unit_id := nullif(btrim(coalesce(v_line->>'unitId', '')), '')::bigint;

    if v_unit_id is not null then
      -- Pièce du STOCK. Instantanés relus EN BASE, jamais recopiés depuis le
      -- client : ils fixent l'historique et ne doivent pas être falsifiables.
      select u.ref_code, m.name_fr, u.size, u.part
        into v_ref, v_model_name, v_size, v_part
      from public.article_units u
      join public.article_models m on m.id = u.model_id
      where u.id = v_unit_id;

      if not found then
        raise exception 'unit_not_found:%', v_unit_id using errcode = '23503';
      end if;

      -- Une partie de costume : « Tuxedo A · Pantalon ».
      if v_part is not null then
        v_model_name := v_model_name || ' · ' || initcap(v_part);
      end if;

      begin
        insert into public.order_lines (
          order_id, unit_id, unit_price, line_note, model_name_snapshot, size_snapshot
        ) values (
          p_order_id,
          v_unit_id,
          coalesce(nullif(btrim(coalesce(v_line->>'unitPrice', '')), '')::numeric, 0),
          nullif(btrim(coalesce(v_line->>'note', '')), ''),
          v_model_name,
          v_size
        );
      exception when exclusion_violation then
        -- La contrainte anti-double-réservation vient de parler. Cette
        -- exception fait avorter TOUTE la fonction appelante : rien n'est écrit.
        raise exception 'unit_unavailable:%', v_ref using errcode = '23P01';
      end;

    elsif v_line->>'kind' = 'named' then
      -- Vêtement NOMMÉ, hors stock : aucun `unit_id`, donc aucune date bloquée.
      v_label := nullif(btrim(coalesce(v_line->>'name', '')), '');
      if v_label is null then
        raise exception 'named_label_required' using errcode = '22023';
      end if;

      insert into public.order_lines (
        order_id, unit_id, unit_price, line_note, model_name_snapshot, size_snapshot
      ) values (
        p_order_id,
        null,
        coalesce(nullif(btrim(coalesce(v_line->>'unitPrice', '')), '')::numeric, 0),
        nullif(btrim(coalesce(v_line->>'note', '')), ''),
        v_label,
        nullif(btrim(coalesce(v_line->>'size', '')), '')
      );

    else
      -- Pièce sous-louée chez un confrère : pas de `unit_id`, aucune date
      -- bloquée — nous ne gérons pas le planning d'un autre magasin.
      v_label := nullif(btrim(coalesce(v_line->>'label', '')), '');
      if v_label is null then
        raise exception 'external_label_required' using errcode = '22023';
      end if;

      insert into public.order_lines (
        order_id, unit_id, external_source, external_label, external_cost,
        unit_price, line_note, model_name_snapshot
      ) values (
        p_order_id,
        null,
        nullif(btrim(coalesce(v_line->>'source', '')), ''),
        v_label,
        nullif(btrim(coalesce(v_line->>'cost', '')), '')::numeric,
        coalesce(nullif(btrim(coalesce(v_line->>'unitPrice', '')), '')::numeric, 0),
        nullif(btrim(coalesce(v_line->>'note', '')), ''),
        v_label
      );
    end if;
  end loop;
end;
$$;

revoke all on function private.insert_order_lines(bigint, jsonb) from public, anon;
grant execute on function private.insert_order_lines(bigint, jsonb) to authenticated;

-- --- 5. Tableau de bord : un costume découpé ne double pas le CA -------------
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
