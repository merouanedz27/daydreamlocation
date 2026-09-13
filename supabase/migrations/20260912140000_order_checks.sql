-- =============================================================================
-- « Allez Valid » / « Retour Val » — les deux cases du tableur
--
-- CE QUI MANQUAIT
--
-- `picked_up` et `returned` existent depuis le schéma initial, mais aucun écran
-- ne les écrivait et rien n'en déduisait le statut. Conséquence : toute commande
-- restait `reservee` de sa création à la fin des temps. Les statuts `en_cours`
-- et `retournee` figuraient dans la contrainte `check`, dans les badges et dans
-- le filtre de la liste — sans qu'aucun chemin ne puisse les atteindre.
--
-- LE STATUT SE DÉDUIT, IL NE SE SAISIT JAMAIS
--
-- C'est la règle du projet, et elle vient du geste réel du patron : il coche
-- deux cases. Un sélecteur de statut à quatre valeurs lui demanderait
-- d'apprendre un vocabulaire, et permettrait surtout d'écrire « retournée »
-- sans avoir constaté le retour. La dérivation vit donc ici, dans le trigger
-- BEFORE, et appelle `private.order_status_from_flags` — la fonction posée par
-- `20260912120000_cancel_order.sql` précisément pour que les deux chemins
-- (annulation et cases) partagent une seule règle.
--
-- POURQUOI ON ÉTEND `orders_before_update` AU LIEU D'AJOUTER UN TRIGGER
--
-- Deux triggers BEFORE sur la même table s'exécutent dans l'ordre
-- ALPHABÉTIQUE de leur nom, et le second voit le `NEW` réécrit par le premier.
-- Faire dépendre la dérivation du statut d'un ordre de tri est exactement le
-- genre de fragilité que `20260910181000_fix_trigger_timing.sql` a déjà payée
-- une fois. Un seul trigger BEFORE, donc, et une seule fonction.
-- =============================================================================

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

  -- -------------------------------------------------------------------------
  -- Les deux cases viennent de bouger : on en déduit le reste.
  -- -------------------------------------------------------------------------
  if new.picked_up is distinct from old.picked_up
     or new.returned is distinct from old.returned
  then
    -- Une commande ANNULÉE reste annulée. Cocher une case ne la ressuscite
    -- pas : seule `set_order_cancelled` la remet en service, parce qu'elle
    -- seule repasse ses pièces par la contrainte d'exclusion. Sans ce garde,
    -- une case cochée par mégarde sur une commande annulée lui rendrait son
    -- statut sans jamais vérifier que ses vestes sont encore libres.
    if old.status <> 'annulee' then
      new.status := private.order_status_from_flags(new.picked_up, new.returned);
    end if;

    -- Date de retour RÉELLE : posée avec la case, retirée avec elle. Une
    -- case décochée par erreur ne doit pas laisser un retour fantôme.
    --
    -- `current_date` serait faux : Supabase tourne en UTC et la boutique vit
    -- à Alger (UTC+1). Entre minuit et 1 h du matin, `current_date` est encore
    -- la veille — un retour du samedi soir daterait du vendredi. Même piège
    -- que `todayIso()` côté application.
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

comment on function public.orders_before_update is
  'Champs dérivés d''une commande : `updated_at`, `total_price` quand la remise '
  'bouge, et le STATUT déduit des cases « Aller validé » / « Retour validé » — '
  'jamais saisi. Une commande annulée garde son statut : seule '
  '`set_order_cancelled` la remet en service.';

-- NOTE — la plage bloquée ne suit PAS le retour réel.
--
-- Cocher « Retour validé » trois jours plus tôt que prévu ne libère pas la
-- pièce trois jours plus tôt : `rental_range` reste calculée sur
-- `return_due_date`. C'est délibéré pour l'instant. Raccourcir la plage est
-- sûr (on ne peut pas créer de chevauchement en rétrécissant), mais l'ALLONGER
-- pour un retour en retard pourrait heurter la commande suivante — et l'échec
-- empêcherait alors d'enregistrer le retour, ce qui est le pire des résultats :
-- un retard est un problème de terrain, pas une écriture à refuser.
-- À traiter séparément, avec cette asymétrie assumée.
