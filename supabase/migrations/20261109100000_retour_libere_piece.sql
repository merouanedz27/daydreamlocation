-- =============================================================================
-- « Retour Val » coché : la pièce redevient louable TOUT DE SUITE
--
-- LE BUG VU EN BOUTIQUE
--
-- Des pièces rendues (« Invité noir simple ») restaient « Réservé » sur le
-- stock, sans aucune commande affichée dessous. Deux lectures se
-- contredisaient :
--   - `getBlockedUnitIds` bloque une pièce dès qu'une ligne active couvre le
--     jour par sa `rental_range` ;
--   - cette plage restait calculée sur le retour PRÉVU + le nettoyage, même
--     après « Retour Val » (cf. la note de 20260912140000_order_checks.sql) ;
--   - `unit_bookings`, lui, écarte les commandes rentrées : d'où un badge
--     « Réservé » sans commande. Et la contrainte `EXCLUDE` refusait, elle
--     aussi, de relouer la pièce pourtant sur son cintre.
--
-- LA RÈGLE (choix du client)
--
-- Une pièce rentrée est libre dès le jour de son retour réel. Le nettoyage se
-- suit par l'état de la pièce (`nettoyage`, écran Pressing), plus par la plage.
--
-- POURQUOI C'EST SÛR
--
-- La plage d'une commande rentrée ne fait que RÉTRÉCIR : `least(retour réel,
-- fin normale)`. Rétrécir ne crée jamais de chevauchement. Décocher « Retour
-- Val » rend la plage complète : si la pièce a été relouée entre-temps, la
-- contrainte refuse (23P01) — la base reste la seule garantie (règle n°5).
-- Rendue le jour même du retrait, la plage est vide : elle ne bloque rien.
-- =============================================================================

-- --- 1. La plage d'une ligne, retour réel compris -----------------------------
create or replace function private.line_range_for(
  p_kind text,
  p_pickup date,
  p_return_due date,
  p_returned_on date
)
returns daterange
language sql
stable
set search_path = ''
as $$
  select case
    when p_kind = 'vente' then daterange(p_pickup, null, '[)')
    when p_returned_on is null then private.rental_range_for(p_pickup, p_return_due)
    else daterange(
      p_pickup,
      greatest(
        p_pickup,
        least(p_returned_on, upper(private.rental_range_for(p_pickup, p_return_due)))
      ),
      '[)'
    )
  end;
$$;

revoke all on function private.line_range_for(text, date, date, date) from public, anon;
grant execute on function private.line_range_for(text, date, date, date) to authenticated;

-- L'ancienne signature reste : une commande pas rentrée.
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
  select private.line_range_for(p_kind, p_pickup, p_return_due, null::date);
$$;

-- Le jour du retour réel, si la commande est rentrée ; sinon `null`.
create or replace function private.order_returned_on(p_order public.orders)
returns date
language sql
stable
set search_path = ''
as $$
  select case when p_order.returned
    then coalesce(p_order.actual_return_date, (now() at time zone 'Africa/Algiers')::date)
  end;
$$;

revoke all on function private.order_returned_on(public.orders) from public, anon;
grant execute on function private.order_returned_on(public.orders) to authenticated;

-- --- 2. À l'insertion d'une ligne ---------------------------------------------
-- `update_order` réinsère les lignes d'une commande déjà rentrée : elles
-- gardent la plage courte.
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
    new.line_kind, v_order.pickup_date, v_order.return_due_date,
    private.order_returned_on(v_order)
  );
  new.is_active := private.order_blocks_stock(v_order.status);

  return new;
end;
$$;

-- --- 3. La commande change : dates, statut, ou les cases ----------------------
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
     or new.returned is distinct from old.returned
     or new.actual_return_date is distinct from old.actual_return_date
  then
    update public.order_lines
    set rental_range = private.line_range_for(
          line_kind, new.pickup_date, new.return_due_date,
          private.order_returned_on(new)
        ),
        is_active = private.order_blocks_stock(new.status)
    where order_id = new.id;
  end if;

  return null;
end;
$$;

-- --- 4. Les commandes déjà rentrées libèrent leurs pièces ---------------------
-- Rétrécissement pur : aucun risque de heurter la contrainte d'exclusion.
update public.order_lines l
set rental_range = private.line_range_for(
      l.line_kind, o.pickup_date, o.return_due_date, private.order_returned_on(o)
    )
from public.orders o
where o.id = l.order_id
  and o.returned
  and l.line_kind = 'location';
