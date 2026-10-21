-- =============================================================================
-- Hors ligne, phase 3 : commandes PROVISOIRES.
--
-- Sans réseau, une commande (nouvelle ou modifiée) est gardée sur le
-- téléphone, marquée « en attente — non confirmée ». Au retour du réseau elle
-- part, et c'est ICI que tout se décide, comme en ligne : la contrainte
-- EXCLUDE de `order_lines` accepte ou refuse chaque pièce.
--
-- Deux protections de plus, propres à l'envoi différé :
--
--   1. `create_order_once` — une création renvoyée (réponse perdue en route)
--      ne crée pas une seconde commande : le téléphone tire un identifiant
--      (`client_op_id`), la base ne l'accepte qu'une fois.
--   2. `update_order_checked` — une modification faite hors ligne porte la
--      VERSION de la commande d'où elle part (`orders.version`, +1 à chaque
--      écriture). Si un collègue l'a changée entre-temps (✈, encaissement,
--      autre modification), elle est refusée (`order_changed`) au lieu
--      d'écraser son travail.
--
--      Un compteur et non `updated_at` : `now()` est l'heure du DÉBUT de la
--      transaction, deux écritures dans la même transaction portent donc la
--      même — un verrou ne peut pas reposer là-dessus.
--
-- `create_order` et `update_order` ne changent pas : ces fonctions les
-- enveloppent, dans la même transaction.
-- =============================================================================

alter table public.orders add column client_op_id uuid;

create unique index orders_client_op_id_key
  on public.orders (client_op_id) where client_op_id is not null;

alter table public.orders add column version bigint not null default 1;

comment on column public.orders.version is
  'Version de la commande, +1 à chaque écriture : une modification hors ligne partie d''une version périmée est refusée.';

create or replace function private.bump_order_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version := old.version + 1;
  return new;
end;
$$;

revoke all on function private.bump_order_version() from public, anon, authenticated;

create trigger orders_bump_version
  before update on public.orders
  for each row execute function private.bump_order_version();

comment on column public.orders.client_op_id is
  'Identifiant tiré sur le téléphone pour une commande saisie hors ligne : un renvoi ne la crée pas deux fois.';

-- --- 1. Création une seule fois -----------------------------------------------
create or replace function public.create_order_once(
  p_client_op_id    uuid,
  p_customer_name   text,
  p_customer_phone  text,
  p_event_date      date,
  p_pickup_date     date default null,
  p_return_due_date date default null,
  p_discount        numeric default 0,
  p_amount_paid     numeric default 0,
  p_caution_amount  numeric default 0,
  p_notes           text default null,
  p_lines           jsonb default '[]'::jsonb
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order_id bigint;
begin
  if p_client_op_id is null then
    raise exception 'client_op_id_required' using errcode = '22023';
  end if;

  -- Déjà reçue : on rend la commande existante, sans rien recréer.
  select o.id into v_order_id from public.orders o where o.client_op_id = p_client_op_id;
  if found then
    return v_order_id;
  end if;

  v_order_id := public.create_order(
    p_customer_name, p_customer_phone, p_event_date, p_pickup_date, p_return_due_date,
    p_discount, p_amount_paid, p_caution_amount, p_notes, p_lines
  );

  -- Deux renvois simultanés : le second bute ici sur l'index unique (23505)
  -- et TOUTE sa transaction s'annule — sa commande en double avec.
  update public.orders set client_op_id = p_client_op_id where id = v_order_id;

  return v_order_id;
end;
$$;

revoke all on function public.create_order_once(uuid, text, text, date, date, date, numeric, numeric, numeric, text, jsonb) from public, anon;
grant execute on function public.create_order_once(uuid, text, text, date, date, date, numeric, numeric, numeric, text, jsonb) to authenticated;

comment on function public.create_order_once is
  'create_order() pour une commande saisie hors ligne : le même p_client_op_id ne crée qu''une commande.';

-- --- 2. Modification à partir d'une version connue ------------------------------
create or replace function public.update_order_checked(
  p_expected_version bigint,
  p_order_id        bigint,
  p_customer_name   text,
  p_customer_phone  text,
  p_event_date      date,
  p_pickup_date     date,
  p_return_due_date date,
  p_amount_paid     numeric default 0,
  p_caution_amount  numeric default 0,
  p_notes           text default null,
  p_picked_up       boolean default false,
  p_returned        boolean default false,
  p_lines           jsonb default '[]'::jsonb
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current bigint;
begin
  -- Verrou d'abord : personne ne modifie la commande entre la comparaison et
  -- l'écriture.
  select o.version into v_current from public.orders o where o.id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if p_expected_version is null or v_current is distinct from p_expected_version then
    raise exception 'order_changed' using errcode = 'P0005';
  end if;

  return public.update_order(
    p_order_id, p_customer_name, p_customer_phone, p_event_date, p_pickup_date,
    p_return_due_date, p_amount_paid, p_caution_amount, p_notes, p_picked_up,
    p_returned, p_lines
  );
end;
$$;

revoke all on function public.update_order_checked(bigint, bigint, text, text, date, date, date, numeric, numeric, text, boolean, boolean, jsonb) from public, anon;
grant execute on function public.update_order_checked(bigint, bigint, text, text, date, date, date, numeric, numeric, text, boolean, boolean, jsonb) to authenticated;

comment on function public.update_order_checked is
  'update_order() pour une modification faite hors ligne : refusée (order_changed, P0005) si la commande a changé depuis p_expected_version.';
