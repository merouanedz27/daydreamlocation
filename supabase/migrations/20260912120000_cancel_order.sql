-- =============================================================================
-- Annuler une commande — et revenir en arrière
--
-- LE TROU QUE CECI BOUCHE
--
-- Jusqu'ici rien, dans l'application, ne pouvait toucher une commande après sa
-- création. Une commande saisie par erreur bloquait donc ses pièces POUR
-- TOUJOURS : la contrainte d'exclusion faisait exactement son travail, mais
-- plus aucun samedi de mariage ne pouvait réutiliser cette veste. Pour une
-- application dont le cœur est la disponibilité, c'était le défaut le plus
-- grave.
--
-- Toute la mécanique existait déjà : `private.order_blocks_stock` rend
-- `is_active` faux dès que le statut vaut « annulee », et
-- `orders_propagate_to_lines` le recopie sur les lignes. Il ne manquait qu'un
-- point d'entrée.
--
-- POURQUOI UNE FONCTION ET PAS UN SIMPLE UPDATE DEPUIS L'APPLICATION
--
-- Parce que la RÉACTIVATION peut échouer, et qu'elle doit échouer bien. Remettre
-- une commande en service repasse `is_active` à vrai, donc soumet à nouveau ses
-- pièces à la contrainte d'exclusion : si la veste a été relouée entre-temps,
-- Postgres refuse — et c'est heureux. Mais il refuse en disant « 23P01 », ce qui
-- ne se corrige pas. Ici on intercepte et on NOMME la pièce en conflit, comme
-- `create_order` le fait déjà. « Gio-079-01 est déjà réservée » est actionnable.
--
-- `security invoker` : la RLS de `orders` s'applique telle quelle
-- (`orders_update` autorise le rôle `staff`). Cette fonction n'accorde aucun
-- droit supplémentaire.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Statut d'une commande EN SERVICE, déduit des deux cases du tableur.
--
-- « Allez Valid » / « Retour Val » sont le geste du patron ; le statut s'en
-- déduit, il ne se saisit jamais. Les deux colonnes existent depuis le schéma
-- initial mais ne sont encore écrites par aucun écran : cette fonction vaut
-- donc « reservee » en pratique. Elle est écrite ici, et non dans le TypeScript
-- de l'application, pour que le jour où les cases apparaîtront le trigger qui
-- les surveillera appelle la MÊME règle — et non une seconde dérivation qui
-- finirait par diverger.
-- -----------------------------------------------------------------------------
create or replace function private.order_status_from_flags(
  p_picked_up boolean,
  p_returned boolean
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_returned  then 'retournee'
    when p_picked_up then 'en_cours'
    else                  'reservee'
  end;
$$;

comment on function private.order_status_from_flags is
  'Statut d''une commande en service, déduit des cases « Aller validé » / '
  '« Retour validé ». Source de vérité unique de cette règle.';

-- `set_order_cancelled` est `security invoker` : c'est `authenticated` lui-même
-- qui appelle ce helper, il lui faut donc EXECUTE. Même leçon que
-- `20260910190000_fix_helper_grants.sql` — le schéma `private` reste hors de
-- portée de PostgREST, donc inappelable en RPC.
revoke all on function private.order_status_from_flags(boolean, boolean)
  from public, anon;
grant execute on function private.order_status_from_flags(boolean, boolean)
  to authenticated;

create or replace function public.set_order_cancelled(
  p_order_id bigint,
  p_cancelled boolean
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order  public.orders%rowtype;
  v_target text;
  v_ref    text;
begin
  -- `for update` sérialise deux téléphones qui annulent la même commande au
  -- même instant. Le verrou exige de passer les policies SELECT **et** UPDATE :
  -- c'est la RLS qui tranche, pas cette fonction.
  select * into v_order from public.orders where id = p_order_id for update;

  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;

  v_target := case
    when p_cancelled then 'annulee'
    else private.order_status_from_flags(v_order.picked_up, v_order.returned)
  end;

  -- Déjà dans l'état demandé : rien à faire, et surtout aucune écriture inutile
  -- qui repasserait les pièces par la contrainte d'exclusion pour rien.
  if v_order.status = v_target then
    return v_target;
  end if;

  begin
    update public.orders set status = v_target where id = p_order_id;
  exception
    when exclusion_violation then
      -- La réactivation vient de heurter une commande postérieure. On retrouve
      -- laquelle de NOS pièces est en cause pour pouvoir la nommer.
      --
      -- `l.rental_range` est encore juste : le retour en arrière du bloc
      -- d'exception a défait `is_active`, mais les DATES de la commande n'ont
      -- pas changé — donc la plage bloquée non plus.
      select u.ref_code into v_ref
      from public.order_lines l
      join public.article_units u on u.id = l.unit_id
      where l.order_id = p_order_id
        and l.unit_id is not null
        and exists (
          select 1
          from public.order_lines other
          where other.unit_id = l.unit_id
            and other.order_id <> p_order_id
            and other.is_active
            and other.rental_range && l.rental_range
        )
      order by u.ref_code
      limit 1;

      raise exception 'unit_unavailable:%', coalesce(v_ref, '?')
        using errcode = '23P01';
  end;

  return v_target;
end;
$$;

comment on function public.set_order_cancelled is
  'Annule une commande (libère ses pièces) ou la remet en service. La remise en '
  'service repasse par la contrainte d''exclusion : si une pièce a été relouée '
  'entre-temps, lève 23P01 « unit_unavailable:<ref> » et rien n''est écrit. '
  'Renvoie le statut obtenu.';

-- Le rôle anonyme n'a rien à faire ici : on n'annule pas une commande sans compte.
revoke all on function public.set_order_cancelled(bigint, boolean) from public, anon;
grant execute on function public.set_order_cancelled(bigint, boolean) to authenticated;
