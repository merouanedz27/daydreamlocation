-- =============================================================================
-- Correction du chaînage des triggers
--
-- Bug détecté par `supabase/tests/availability.sql` (test 7, annulation d'une
-- commande) :
--
--   "tuple to be updated was already modified by an operation triggered by
--    the current command"
--
-- CAUSE : `orders_propagate_to_lines` était un trigger BEFORE UPDATE sur
-- `orders` qui modifiait `order_lines`. Cette modification déclenchait à son
-- tour `order_lines_recompute_totals`, qui remettait à jour la LIGNE `orders`
-- en cours de traitement par le trigger BEFORE. Postgres refuse.
--
-- RÈGLE : un trigger qui modifie D'AUTRES lignes doit être AFTER. Un trigger
-- BEFORE ne doit toucher que NEW.
--
-- Conséquence pratique : toute annulation de commande échouait, donc aucune
-- pièce n'était jamais libérée.
-- =============================================================================

drop trigger if exists orders_propagate_to_lines_trg on public.orders;
drop trigger if exists order_lines_recompute_totals_trg on public.order_lines;

-- -----------------------------------------------------------------------------
-- 1. BEFORE : uniquement des champs de la ligne elle-même.
--    `total_price` doit suivre `discount`, qui est saisi sur la commande.
-- -----------------------------------------------------------------------------
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

  return new;
end;
$$;

create trigger orders_before_update_trg
  before update on public.orders
  for each row
  execute function public.orders_before_update();

-- -----------------------------------------------------------------------------
-- 2. AFTER : propagation vers les lignes (d'autres lignes => AFTER).
--
--    C'est cette mise à jour qui soumet un changement de dates à la contrainte
--    d'exclusion : décaler une commande sur un créneau déjà pris échoue, au
--    lieu de créer silencieusement une double-réservation.
-- -----------------------------------------------------------------------------
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
    set rental_range = private.rental_range_for(
          new.pickup_date, new.return_due_date
        ),
        is_active = private.order_blocks_stock(new.status)
    where order_id = new.id;
  end if;

  return null;
end;
$$;

create trigger orders_propagate_to_lines_trg
  after update on public.orders
  for each row
  execute function public.orders_propagate_to_lines();

-- -----------------------------------------------------------------------------
-- 3. Recalcul des totaux : uniquement quand un PRIX change.
--
--    `update of unit_price` est essentiel : sans cette restriction, la
--    propagation ci-dessus (qui n'écrit que `rental_range` et `is_active`)
--    relancerait un recalcul des totaux, donc un UPDATE sur `orders`, donc une
--    nouvelle propagation. La cascade se terminerait, mais ferait deux
--    allers-retours inutiles à chaque changement de date.
-- -----------------------------------------------------------------------------
create or replace function public.orders_recompute_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id bigint := coalesce(new.order_id, old.order_id);
  v_subtotal numeric(12, 2);
begin
  select coalesce(sum(unit_price), 0) into v_subtotal
  from public.order_lines
  where order_id = v_order_id;

  update public.orders
  set subtotal = v_subtotal,
      total_price = greatest(v_subtotal - discount, 0)
  where id = v_order_id
    and (subtotal is distinct from v_subtotal
         or total_price is distinct from greatest(v_subtotal - discount, 0));

  return null;
end;
$$;

create trigger order_lines_recompute_totals_trg
  after insert or delete or update of unit_price on public.order_lines
  for each row
  execute function public.orders_recompute_totals();
