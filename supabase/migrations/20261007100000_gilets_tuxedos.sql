-- =============================================================================
-- Tuxedos : le GILET devient une pièce réelle
--
-- La liste du stock du client : les Tuxedos A à G sont veste + gilet +
-- pantalon ; les Invités et le Costume Bleu à Rayures, veste + pantalon. La
-- migration 20261006140000 a découpé chaque costume en veste + pantalon
-- seulement — il manque le gilet des Tuxedos.
--
-- Chaque jeu Tuxedo (« TUX-A-03 ») reçoit sa pièce gilet « TUX-A-03-G », à la
-- taille de la veste. Prix de la partie à 0 : le patron le saisit.
-- =============================================================================

-- --- 1. Le modèle déclare son gilet ------------------------------------------
insert into public.article_model_parts (model_id, part, rent_price, position)
select m.id, 'gilet', 0, 3
from public.article_models m
join public.categories c on c.id = m.category_id and c.slug = 'costume'
where m.name_fr like 'Tuxedo %'
on conflict do nothing;

-- --- 2. Une pièce gilet par jeu ----------------------------------------------
insert into public.article_units (
  model_id, ref_code, size, length_cm, price_override, purchase_price, purchase_date,
  condition, status, status_since, notes, set_ref, part
)
select v.model_id, v.set_ref || '-G', v.size, null, null, null, v.purchase_date,
       v.condition, v.status, v.status_since, null, v.set_ref, 'gilet'
from public.article_units v
join public.article_models m on m.id = v.model_id
join public.categories c on c.id = m.category_id and c.slug = 'costume'
where m.name_fr like 'Tuxedo %'
  and v.part = 'veste'
  and not exists (
    select 1 from public.article_units g
    where g.set_ref = v.set_ref and g.part = 'gilet'
  );

-- --- 3. Les Tuxedos déjà réservés emportent leur gilet -----------------------
-- Ces commandes louent le costume entier (veste + pantalon, prix sur la
-- veste). Le gilet part avec la veste : il reçoit une ligne sœur à prix 0,
-- bloquée aux mêmes dates par la contrainte EXCLUDE.
insert into public.order_lines (
  order_id, unit_id, unit_price, line_note, model_name_snapshot, size_snapshot
)
select ol.order_id, g.id, 0, null, m.name_fr || ' · Gilet', g.size
from public.order_lines ol
join public.orders o on o.id = ol.order_id
join public.article_units v on v.id = ol.unit_id and v.part = 'veste'
join public.article_units g on g.set_ref = v.set_ref and g.part = 'gilet'
join public.article_models m on m.id = g.model_id
where m.name_fr like 'Tuxedo %'
  and ol.is_active
  and o.status <> 'annulee'
  and not exists (
    select 1 from public.order_lines x
    where x.order_id = ol.order_id and x.unit_id = g.id
  );
