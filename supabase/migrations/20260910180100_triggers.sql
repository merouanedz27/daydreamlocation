-- =============================================================================
-- Triggers de cohérence
--
-- La contrainte d'exclusion sur `order_lines` ne peut pas faire de jointure :
-- elle travaille sur `rental_range` et `is_active`, portés par la ligne. Ces
-- deux colonnes doivent donc rester synchronisées avec la commande parente,
-- sinon la protection contre la double-réservation devient silencieusement
-- fausse — le pire des cas.
-- =============================================================================

-- Plage réellement bloquée par une pièce : de la date de retrait jusqu'au
-- retour prévu, plus le battement de nettoyage.
-- Borne haute EXCLUSIVE : une pièce rendue le 27 avec 1 jour de battement est
-- relouable le 28. `[27, 29)` chevauche donc `[28, 30)` mais pas `[29, 31)`.
create or replace function private.rental_range_for(
  p_pickup date,
  p_return_due date
)
returns daterange
language sql
stable
set search_path = ''
as $$
  select daterange(
    p_pickup,
    p_return_due + 1 + (select cleaning_buffer_days from public.settings where id),
    '[)'
  );
$$;

-- Une commande annulée libère ses pièces.
create or replace function private.order_blocks_stock(p_status text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_status <> 'annulee';
$$;

-- -----------------------------------------------------------------------------
-- À l'insertion / modification d'une ligne : recopier les dates de la commande.
-- -----------------------------------------------------------------------------
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

  new.rental_range := private.rental_range_for(
    v_order.pickup_date, v_order.return_due_date
  );
  new.is_active := private.order_blocks_stock(v_order.status);

  return new;
end;
$$;

create trigger order_lines_sync_range_trg
  before insert or update of order_id on public.order_lines
  for each row
  execute function public.order_lines_sync_range();

-- -----------------------------------------------------------------------------
-- Quand les dates ou le statut d'une commande changent, propager aux lignes.
--
-- C'est ici que se joue la correction d'un bug classique : décaler une commande
-- d'une semaine sans re-vérifier les pièces. La mise à jour déclenche la
-- contrainte d'exclusion, donc un décalage vers un créneau déjà pris ÉCHOUE.
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

  new.updated_at := now();
  return new;
end;
$$;

create trigger orders_propagate_to_lines_trg
  before update on public.orders
  for each row
  execute function public.orders_propagate_to_lines();

-- -----------------------------------------------------------------------------
-- Totaux de la commande recalculés depuis ses lignes.
-- `subtotal` et `total_price` ne sont jamais saisis à la main.
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
  where id = v_order_id;

  return null;
end;
$$;

create trigger order_lines_recompute_totals_trg
  after insert or update or delete on public.order_lines
  for each row
  execute function public.orders_recompute_totals();

-- -----------------------------------------------------------------------------
-- Fenêtre de location par défaut, déduite de la date de l'événement.
-- L'employé ne saisit qu'une date ; il peut toujours corriger les deux autres.
-- -----------------------------------------------------------------------------
create or replace function public.orders_default_window()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.settings%rowtype;
begin
  select * into v_settings from public.settings where id;

  if new.pickup_date is null then
    new.pickup_date := new.event_date - v_settings.days_before_event;
  end if;

  if new.return_due_date is null then
    new.return_due_date := new.event_date + v_settings.days_after_event;
  end if;

  return new;
end;
$$;

create trigger orders_default_window_trg
  before insert on public.orders
  for each row
  execute function public.orders_default_window();

-- -----------------------------------------------------------------------------
-- Un nouveau compte auth reçoit automatiquement son profil.
-- Rôle `staff` par défaut : `owner` se donne explicitement.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'role', 'staff')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
