-- =============================================================================
-- Une pièce EN RETARD ne repart pas — et le stock dit qui tient chaque pièce
--
-- LE TROU QUE CECI BOUCHE
--
-- La contrainte `EXCLUDE` bloque une pièce sur `rental_range`, calculée sur le
-- retour PRÉVU. Une veste sortie (« Allez Valid » coché) et pas rentrée à la
-- date prévue redevenait donc louable dès la fin de sa plage : l'écran la
-- proposait à un autre client alors qu'elle était encore chez le premier.
--
-- On n'ALLONGE pas la plage (cf. 20260912140000_order_checks.sql) : l'allonger
-- pourrait heurter la commande suivante et empêcher d'enregistrer le retour.
-- On refuse plutôt toute NOUVELLE ligne sur une pièce en retard, tant que
-- « Retour Val » n'est pas coché. Les réservations déjà prises restent.
--
-- En retard = commande active, `picked_up` et pas `returned`, retour prévu
-- avant aujourd'hui (heure d'Alger).
-- =============================================================================

-- --- 1. Les pièces qu'une modification retire puis remet ----------------------
-- `update_order` efface toutes les lignes puis les réinsère. Sans ceci, la
-- commande du 20 décembre qui tient DÉJÀ une veste aujourd'hui en retard chez
-- un autre client ne pourrait plus être modifiée. On note, pour la durée de la
-- transaction seulement, chaque couple « commande:pièce » effacé.
create or replace function private.remember_removed_unit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.unit_id is not null then
    perform set_config(
      'daydream.removed_units',
      coalesce(current_setting('daydream.removed_units', true), ',')
        || old.order_id || ':' || old.unit_id || ',',
      true
    );
  end if;
  return old;
end;
$$;

revoke all on function private.remember_removed_unit() from public, anon, authenticated;

create trigger order_lines_remember_removed_trg
  before delete on public.order_lines
  for each row
  execute function private.remember_removed_unit();

-- --- 2. Le refus --------------------------------------------------------------
-- `security definer` : la vérification doit voir TOUTES les commandes, quelle
-- que soit la policy de l'appelant.
create or replace function private.refuse_late_unit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ref text;
begin
  if new.unit_id is null then
    return new;
  end if;

  -- La pièce était déjà sur CETTE commande (modification) : elle reste.
  if position(
       ',' || new.order_id || ':' || new.unit_id || ','
       in coalesce(current_setting('daydream.removed_units', true), '')
     ) > 0 then
    return new;
  end if;

  if exists (
    select 1
    from public.order_lines l
    join public.orders o on o.id = l.order_id
    where l.unit_id = new.unit_id
      and l.order_id <> new.order_id
      and l.is_active
      and l.line_kind = 'location'
      and o.picked_up
      and not o.returned
      and o.return_due_date < (now() at time zone 'Africa/Algiers')::date
  ) then
    select ref_code into v_ref from public.article_units where id = new.unit_id;
    -- Code DISTINCT de 23P01 : les fonctions de commande n'interceptent que
    -- `exclusion_violation`, ce refus remonte donc tel quel à l'application.
    raise exception 'unit_late:%', coalesce(v_ref, '?') using errcode = 'P0006';
  end if;

  return new;
end;
$$;

revoke all on function private.refuse_late_unit() from public, anon, authenticated;

create trigger order_lines_refuse_late_trg
  before insert or update of unit_id on public.order_lines
  for each row
  execute function private.refuse_late_unit();

-- La recherche des sorties non rentrées, sans parcourir toutes les commandes.
create index orders_out_not_returned_idx on public.orders (return_due_date)
  where picked_up and not returned and status <> 'annulee';

-- --- 3. Qui tient chaque pièce : l'indicateur du stock ------------------------
-- Une ligne par réservation ENCORE EN COURS : plage pas encore finie, ou
-- pièce sortie et pas rentrée (même en retard). `security invoker` : la RLS
-- de `orders` / `order_lines` s'applique.
create or replace function public.unit_bookings(p_today date)
returns table (
  unit_id bigint,
  order_id bigint,
  order_no text,
  customer_name text,
  pickup_date date,
  return_due_date date,
  picked_up boolean,
  late boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    l.unit_id,
    o.id,
    o.order_no,
    o.customer_name,
    o.pickup_date,
    o.return_due_date,
    o.picked_up,
    o.picked_up and not o.returned and o.return_due_date < p_today
  from public.order_lines l
  join public.orders o on o.id = l.order_id
  where l.unit_id is not null
    and l.is_active
    and l.line_kind = 'location'
    and not o.returned
    and (upper(l.rental_range) > p_today or o.picked_up)
  order by o.pickup_date, o.id;
$$;

revoke all on function public.unit_bookings(date) from public, anon;
grant execute on function public.unit_bookings(date) to authenticated;

comment on function public.unit_bookings is
  'Réservations en cours par pièce (pas rentrées, plage non finie ou pièce sortie). '
  '`late` = sortie, pas rentrée, retour prévu dépassé. Sert à l''indicateur du stock.';
