-- =============================================================================
-- Row Level Security
--
-- RLS est activée sur TOUTES les tables, sans exception : une table sans policy
-- est une fuite de données. La clé publiable étant visible dans le navigateur
-- par conception, ces policies sont la seule véritable protection.
--
-- Deux règles de performance (skill `supabase-postgres-best-practices`) :
--   * `auth.uid()` nu est évalué UNE FOIS PAR LIGNE ; enveloppé dans un
--     `select`, une seule fois pour la requête ;
--   * interroger `profiles` directement dans une policy déclencherait la policy
--     de `profiles` à son tour (récursion) — d'où des helpers SECURITY DEFINER
--     dans le schéma privé, qui contournent RLS de façon contrôlée.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

create or replace function private.is_owner()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and role = 'owner'
      and is_active
  );
$$;

-- Membre actif de l'équipe (propriétaire inclus).
create or replace function private.is_staff()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and is_active
  );
$$;

revoke execute on function private.is_owner() from public, anon, authenticated;
revoke execute on function private.is_staff() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
alter table public.settings         enable row level security;
alter table public.profiles         enable row level security;
alter table public.categories       enable row level security;
alter table public.article_models   enable row level security;
alter table public.article_units    enable row level security;
alter table public.ensembles        enable row level security;
alter table public.ensemble_items   enable row level security;
alter table public.orders           enable row level security;
alter table public.order_lines      enable row level security;
alter table public.expenses         enable row level security;

-- -----------------------------------------------------------------------------
-- Paramètres — lecture équipe, écriture propriétaire.
-- -----------------------------------------------------------------------------
create policy settings_read on public.settings
  for select to authenticated using ((select private.is_staff()));

create policy settings_write on public.settings
  for update to authenticated
  using ((select private.is_owner()))
  with check ((select private.is_owner()));

-- -----------------------------------------------------------------------------
-- Profils — chacun voit le sien ; le propriétaire gère toute l'équipe.
-- Aucun `insert` : les profils naissent du trigger `on_auth_user_created`.
-- -----------------------------------------------------------------------------
create policy profiles_read_self on public.profiles
  for select to authenticated using (id = (select auth.uid()));

create policy profiles_read_all_owner on public.profiles
  for select to authenticated using ((select private.is_owner()));

create policy profiles_update_owner on public.profiles
  for update to authenticated
  using ((select private.is_owner()))
  with check ((select private.is_owner()));

-- -----------------------------------------------------------------------------
-- Catalogue — toute l'équipe lit, le propriétaire seul modifie le stock.
-- -----------------------------------------------------------------------------
create policy categories_read on public.categories
  for select to authenticated using ((select private.is_staff()));
create policy categories_write on public.categories
  for all to authenticated
  using ((select private.is_owner())) with check ((select private.is_owner()));

create policy article_models_read on public.article_models
  for select to authenticated using ((select private.is_staff()));
create policy article_models_write on public.article_models
  for all to authenticated
  using ((select private.is_owner())) with check ((select private.is_owner()));

create policy article_units_read on public.article_units
  for select to authenticated using ((select private.is_staff()));
create policy article_units_write on public.article_units
  for all to authenticated
  using ((select private.is_owner())) with check ((select private.is_owner()));

create policy ensembles_read on public.ensembles
  for select to authenticated using ((select private.is_staff()));
create policy ensembles_write on public.ensembles
  for all to authenticated
  using ((select private.is_owner())) with check ((select private.is_owner()));

create policy ensemble_items_read on public.ensemble_items
  for select to authenticated using ((select private.is_staff()));
create policy ensemble_items_write on public.ensemble_items
  for all to authenticated
  using ((select private.is_owner())) with check ((select private.is_owner()));

-- -----------------------------------------------------------------------------
-- Commandes — le métier quotidien de l'équipe.
-- Suppression réservée au propriétaire : une commande effacée par erreur
-- emporte son historique.
-- -----------------------------------------------------------------------------
create policy orders_read on public.orders
  for select to authenticated using ((select private.is_staff()));

create policy orders_insert on public.orders
  for insert to authenticated with check ((select private.is_staff()));

create policy orders_update on public.orders
  for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));

create policy orders_delete_owner on public.orders
  for delete to authenticated using ((select private.is_owner()));

create policy order_lines_read on public.order_lines
  for select to authenticated using ((select private.is_staff()));

create policy order_lines_insert on public.order_lines
  for insert to authenticated with check ((select private.is_staff()));

create policy order_lines_update on public.order_lines
  for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));

create policy order_lines_delete on public.order_lines
  for delete to authenticated using ((select private.is_staff()));

-- -----------------------------------------------------------------------------
-- Dépenses — PROPRIÉTAIRE UNIQUEMENT.
--
-- C'est la frontière qui sépare `staff` de `owner` : les charges, les salaires
-- et donc le bénéfice ne regardent pas l'équipe.
-- -----------------------------------------------------------------------------
create policy expenses_owner_all on public.expenses
  for all to authenticated
  using ((select private.is_owner()))
  with check ((select private.is_owner()));
