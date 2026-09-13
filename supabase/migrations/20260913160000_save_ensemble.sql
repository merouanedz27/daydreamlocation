-- =============================================================================
-- save_ensemble — créer ou modifier un ensemble et ses pièces, ATOMIQUEMENT
--
-- Un ensemble (« Costume n°12 ») est une ligne `ensembles` plus N lignes
-- `ensemble_items`. En deux appels PostgREST, une modification reviendrait à
-- « effacer les pièces, puis réinsérer la nouvelle liste » : si la seconde
-- écriture échoue (réseau mobile coupé, pièce supprimée entre-temps),
-- l'ensemble resterait VIDE — et la prochaine commande qui le choisit ne
-- déplierait plus rien, sans que personne ne comprenne pourquoi.
--
-- Une fonction = une transaction : tout passe, ou rien ne change.
--
-- `security invoker` : la RLS s'applique telle quelle. Seul le propriétaire
-- écrit (`ensembles_insert/update/delete`, `ensemble_items_*`). Cette fonction
-- n'accorde aucun droit, elle ne garantit que l'atomicité.
--
-- Rappel du domaine : un ensemble NE SE RÉSERVE JAMAIS. Il n'est qu'un
-- raccourci de saisie, et une même pièce peut figurer dans plusieurs ensembles.
-- =============================================================================

create or replace function public.save_ensemble(
  p_id bigint default null,
  p_name text default null,
  p_description text default null,
  p_package_price numeric default null,
  p_unit_ids bigint[] default '{}'::bigint[]
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id bigint;
begin
  if p_name is null or btrim(p_name) = '' then
    raise exception 'ensemble_name_required' using errcode = '22023';
  end if;

  if coalesce(cardinality(p_unit_ids), 0) = 0 then
    raise exception 'ensemble_units_required' using errcode = '22023';
  end if;

  -- Une pièce inconnue ou RETIRÉE du stock n'a rien à faire dans un raccourci
  -- de saisie : la commande la refuserait au moment de louer.
  if exists (
    select 1
      from unnest(p_unit_ids) as u (id)
      left join public.article_units a on a.id = u.id
     where a.id is null or a.status = 'retire'
  ) then
    raise exception 'ensemble_unit_invalid' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.ensembles (name, description, package_price)
    values (
      btrim(p_name),
      nullif(btrim(coalesce(p_description, '')), ''),
      p_package_price
    )
    returning id into v_id;
  else
    update public.ensembles
       set name = btrim(p_name),
           description = nullif(btrim(coalesce(p_description, '')), ''),
           package_price = p_package_price
     where id = p_id
    returning id into v_id;

    -- Ensemble inexistant, OU invisible pour cet utilisateur : RLS rend un
    -- update à zéro ligne, sans erreur. On le dit.
    if v_id is null then
      raise exception 'ensemble_not_found' using errcode = 'P0002';
    end if;
  end if;

  delete from public.ensemble_items
   where ensemble_id = v_id
     and unit_id <> all (p_unit_ids);

  insert into public.ensemble_items (ensemble_id, unit_id)
  select distinct v_id, u.id
    from unnest(p_unit_ids) as u (id)
  on conflict do nothing;

  return v_id;
end;
$$;

comment on function public.save_ensemble is
  'Crée (p_id null) ou modifie un ensemble et remplace sa liste de pièces, en '
  'une transaction. security invoker : seul le propriétaire écrit, par RLS.';

revoke all on function public.save_ensemble(bigint, text, text, numeric, bigint[])
  from public, anon;
grant execute on function public.save_ensemble(bigint, text, text, numeric, bigint[])
  to authenticated;
