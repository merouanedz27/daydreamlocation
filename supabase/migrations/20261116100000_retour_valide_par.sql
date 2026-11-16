-- =============================================================================
-- « Retour validé par » — qui a coché la case, et quand
--
-- Au retour, un employé contrôle les pièces puis coche « Retour validé ». Si
-- une pièce abîmée passe le contrôle, rien ne disait QUI l'avait validée. On
-- l'enregistre ici, dans le trigger BEFORE (un seul, voir
-- 20260912140000_order_checks), avec `auth.uid()` : l'appelant réel, que la
-- case vienne de la fiche, de la liste, de la modification ou de la file hors
-- ligne. Affiché au propriétaire seul (comme `created_by`).
--
-- Les retours validés AVANT cette migration restent sans nom.
-- =============================================================================

alter table public.orders
  add column returned_by uuid references public.profiles (id) on delete set null,
  add column returned_at timestamptz;

create index orders_returned_by_idx
  on public.orders (returned_by) where returned_by is not null;

comment on column public.orders.returned_by is
  'Qui a coché « Retour validé » (auth.uid() au moment du geste). Nul si décoché.';
comment on column public.orders.returned_at is
  'Quand « Retour validé » a été coché. Nul si décoché.';

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
    -- Et QUI a validé le retour, et quand — retirés avec la case.
    if new.returned and not old.returned then
      new.actual_return_date := coalesce(
        new.actual_return_date,
        (now() at time zone 'Africa/Algiers')::date
      );
      new.returned_by := auth.uid();
      new.returned_at := now();
    elsif old.returned and not new.returned then
      new.actual_return_date := null;
      new.returned_by := null;
      new.returned_at := null;
    end if;
  end if;

  return new;
end;
$$;
