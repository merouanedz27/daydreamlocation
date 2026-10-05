-- =============================================================================
-- Pressing (dégraissage) : l'équipe déclare qu'une pièce part au pressing,
-- puis qu'elle en revient.
--
-- Le statut existait déjà (`article_units.status = 'nettoyage'`), et les écrans
-- de commande grisent déjà une pièce dans cet état. Il manquait :
--
-- 1. LE DROIT pour un employé de le poser. La policy `article_units_update`
--    reste réservée à `can_manage_stock` : un employé ne doit pas pouvoir
--    changer un prix ni une taille. On lui ouvre UNE fonction étroite, qui ne
--    sait faire que disponible ⇄ nettoyage.
-- 2. DEPUIS QUAND : `status_since`, pour que l'écran dise « depuis 3 jours ».
-- 3. LE COÛT du pressing, noté au retour : un frais (catégorie `nettoyage`)
--    écrit dans la MÊME transaction que le changement de statut — jamais l'un
--    sans l'autre.
-- =============================================================================

alter table public.article_units
  add column if not exists status_since timestamptz;

comment on column public.article_units.status_since is
  'Date du dernier changement de statut matériel (ex. départ au pressing). NULL pour les pièces jamais changées.';

create or replace function public.set_pressing(
  p_unit_ids bigint[],
  p_in boolean,
  p_cost numeric default null
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_moved integer;
  v_refs text;
begin
  -- Tout profil ACTIF de l'équipe ; `security definer` contourne la RLS, ce
  -- contrôle est donc la seule porte.
  if not (select private.is_staff()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_unit_ids is null or cardinality(p_unit_ids) = 0 or cardinality(p_unit_ids) > 100 then
    raise exception 'invalid_selection' using errcode = '22023';
  end if;

  if p_cost is not null and (p_cost < 0 or p_cost > 99999999) then
    raise exception 'invalid_cost' using errcode = '22023';
  end if;

  -- Seul le passage disponible ⇄ nettoyage est permis : une pièce en
  -- réparation ou retirée ne se cache ni ne se remet en location d'ici.
  with moved as (
    update public.article_units u
    set status = case when p_in then 'nettoyage' else 'disponible' end,
        status_since = now()
    where u.id = any(p_unit_ids)
      and u.status = case when p_in then 'disponible' else 'nettoyage' end
    returning u.ref_code
  )
  select count(*), string_agg(ref_code, ', ' order by ref_code)
  into v_moved, v_refs
  from moved;

  -- Le prix du pressing, noté au retour, devient un frais : le bénéfice le
  -- compte. Au nom de celui qui saisit, comme tout frais.
  if not p_in and v_moved > 0 and coalesce(p_cost, 0) > 0 then
    insert into public.expenses (spent_on, category, amount, description, created_by)
    values (
      (now() at time zone 'Africa/Algiers')::date,
      'nettoyage',
      p_cost,
      left('Pressing : ' || v_refs, 200),
      (select auth.uid())
    );
  end if;

  return v_moved;
end;
$$;

comment on function public.set_pressing is
  'Envoie des pièces au pressing (p_in = true : disponible → nettoyage) ou les en fait revenir (false : nettoyage → disponible, avec un frais « Pressing » si p_cost > 0). Ouverte à toute l''équipe active ; ne touche à rien d''autre. Rend le nombre de pièces déplacées.';

revoke all on function public.set_pressing(bigint[], boolean, numeric) from public, anon;
grant execute on function public.set_pressing(bigint[], boolean, numeric) to authenticated;
