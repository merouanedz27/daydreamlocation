-- =============================================================================
-- Troisième rôle : MODÉRATEUR.
--
-- Il fait tout ce que fait un employé (commandes, frais) et, EN PLUS, gère le
-- stock : modèles, pièces, ensembles. Il ne voit ni le tableau de bord, ni les
-- dépenses, ni l'équipe, ni la boutique — ceux-là restent au propriétaire.
--
-- `private.is_staff()` accepte déjà tout profil actif : rien à changer pour les
-- commandes. Seules les ÉCRITURES du stock passent de `is_owner` à
-- `can_manage_stock`. Les catégories restent au propriétaire.
-- =============================================================================

alter table public.profiles drop constraint profiles_role_valid;
alter table public.profiles
  add constraint profiles_role_valid check (role in ('owner', 'moderator', 'staff'));

create or replace function private.can_manage_stock()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and role in ('owner', 'moderator')
      and is_active
  );
$$;

revoke execute on function private.can_manage_stock() from public, anon;
grant execute on function private.can_manage_stock() to authenticated;

comment on function private.can_manage_stock is
  'Propriétaire ou modérateur actif : peut écrire dans le stock (modèles, pièces, ensembles).';

-- --- Modèles -----------------------------------------------------------------
drop policy if exists article_models_insert on public.article_models;
drop policy if exists article_models_update on public.article_models;
drop policy if exists article_models_delete on public.article_models;
create policy article_models_insert on public.article_models
  for insert to authenticated with check ((select private.can_manage_stock()));
create policy article_models_update on public.article_models
  for update to authenticated
  using ((select private.can_manage_stock())) with check ((select private.can_manage_stock()));
create policy article_models_delete on public.article_models
  for delete to authenticated using ((select private.can_manage_stock()));

-- --- Pièces ------------------------------------------------------------------
drop policy if exists article_units_insert on public.article_units;
drop policy if exists article_units_update on public.article_units;
drop policy if exists article_units_delete on public.article_units;
create policy article_units_insert on public.article_units
  for insert to authenticated with check ((select private.can_manage_stock()));
create policy article_units_update on public.article_units
  for update to authenticated
  using ((select private.can_manage_stock())) with check ((select private.can_manage_stock()));
create policy article_units_delete on public.article_units
  for delete to authenticated using ((select private.can_manage_stock()));

-- --- Ensembles ---------------------------------------------------------------
drop policy if exists ensembles_insert on public.ensembles;
drop policy if exists ensembles_update on public.ensembles;
drop policy if exists ensembles_delete on public.ensembles;
create policy ensembles_insert on public.ensembles
  for insert to authenticated with check ((select private.can_manage_stock()));
create policy ensembles_update on public.ensembles
  for update to authenticated
  using ((select private.can_manage_stock())) with check ((select private.can_manage_stock()));
create policy ensembles_delete on public.ensembles
  for delete to authenticated using ((select private.can_manage_stock()));

drop policy if exists ensemble_items_insert on public.ensemble_items;
drop policy if exists ensemble_items_update on public.ensemble_items;
drop policy if exists ensemble_items_delete on public.ensemble_items;
create policy ensemble_items_insert on public.ensemble_items
  for insert to authenticated with check ((select private.can_manage_stock()));
create policy ensemble_items_update on public.ensemble_items
  for update to authenticated
  using ((select private.can_manage_stock())) with check ((select private.can_manage_stock()));
create policy ensemble_items_delete on public.ensemble_items
  for delete to authenticated using ((select private.can_manage_stock()));

-- --- Photos du stock : la suppression d'un modèle retire aussi sa photo -------
drop policy if exists articles_owner_delete on storage.objects;
create policy articles_owner_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'articles' and (select private.can_manage_stock()));
