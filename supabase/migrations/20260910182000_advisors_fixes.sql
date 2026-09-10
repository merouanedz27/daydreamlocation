-- =============================================================================
-- Corrections signalées par `supabase db advisors`
--
-- 1. multiple_permissive_policies (PERFORMANCE)
--    Les policies `_write` étaient déclarées `for all`, ce qui INCLUT `select`.
--    Chaque lecture évaluait donc DEUX policies : `_read` puis `_write`, soit
--    deux appels de helper par requête au lieu d'un. On restreint les policies
--    d'écriture à insert / update / delete.
--
-- 2. extension_in_public (SÉCURITÉ)
--    `btree_gist` était installée dans `public`. Une extension dans un schéma
--    exposé par PostgREST élargit inutilement la surface d'attaque.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Séparer lecture et écriture
-- -----------------------------------------------------------------------------

drop policy if exists categories_write on public.categories;
create policy categories_insert on public.categories
  for insert to authenticated with check ((select private.is_owner()));
create policy categories_update on public.categories
  for update to authenticated
  using ((select private.is_owner())) with check ((select private.is_owner()));
create policy categories_delete on public.categories
  for delete to authenticated using ((select private.is_owner()));

drop policy if exists article_models_write on public.article_models;
create policy article_models_insert on public.article_models
  for insert to authenticated with check ((select private.is_owner()));
create policy article_models_update on public.article_models
  for update to authenticated
  using ((select private.is_owner())) with check ((select private.is_owner()));
create policy article_models_delete on public.article_models
  for delete to authenticated using ((select private.is_owner()));

drop policy if exists article_units_write on public.article_units;
create policy article_units_insert on public.article_units
  for insert to authenticated with check ((select private.is_owner()));
create policy article_units_update on public.article_units
  for update to authenticated
  using ((select private.is_owner())) with check ((select private.is_owner()));
create policy article_units_delete on public.article_units
  for delete to authenticated using ((select private.is_owner()));

drop policy if exists ensembles_write on public.ensembles;
create policy ensembles_insert on public.ensembles
  for insert to authenticated with check ((select private.is_owner()));
create policy ensembles_update on public.ensembles
  for update to authenticated
  using ((select private.is_owner())) with check ((select private.is_owner()));
create policy ensembles_delete on public.ensembles
  for delete to authenticated using ((select private.is_owner()));

drop policy if exists ensemble_items_write on public.ensemble_items;
create policy ensemble_items_insert on public.ensemble_items
  for insert to authenticated with check ((select private.is_owner()));
create policy ensemble_items_update on public.ensemble_items
  for update to authenticated
  using ((select private.is_owner())) with check ((select private.is_owner()));
create policy ensemble_items_delete on public.ensemble_items
  for delete to authenticated using ((select private.is_owner()));

-- `profiles` avait deux policies SELECT distinctes (soi-même / propriétaire).
-- Une seule policy avec un `or` exprime la même règle en une évaluation.
drop policy if exists profiles_read_self on public.profiles;
drop policy if exists profiles_read_all_owner on public.profiles;
create policy profiles_read on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select private.is_owner()));

-- `settings` : la policy de lecture couvre `select`, celle d'écriture `update`.
-- Pas de recouvrement, rien à corriger.

-- -----------------------------------------------------------------------------
-- 2. Sortir btree_gist du schéma public
--
-- La contrainte d'exclusion `order_lines_no_double_booking` dépend des classes
-- d'opérateurs de cette extension. Elles sont résolues par OID une fois l'index
-- créé : le déplacement ne casse pas la contrainte existante.
-- -----------------------------------------------------------------------------
create schema if not exists extensions;
alter extension btree_gist set schema extensions;

-- Les futures migrations qui créeront un index gist doivent voir ces classes
-- d'opérateurs sans qualification.
grant usage on schema extensions to postgres, authenticated, service_role;
