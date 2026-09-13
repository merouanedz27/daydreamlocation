-- =============================================================================
-- Gestion de l'équipe : l'administrateur crée et gère ses membres
--
-- Jusqu'ici les comptes ne se créaient qu'en ligne de commande
-- (`scripts/create-account.mjs`). Le patron ne pouvait donc ni ajouter un
-- employé depuis son téléphone, ni lui retirer l'accès quand il s'en va.
--
-- Cette migration ne touche PAS au modèle de permissions : `owner` et `staff`,
-- `private.is_owner()` et `private.is_staff()` restent tels quels, et aucune
-- policy n'est réécrite. `profiles_read` et `profiles_update_owner` disent déjà
-- exactement ce qu'il faut. Ce qui change est en amont : d'où vient un profil,
-- et ce qu'il vaut à sa naissance.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. L'e-mail, recopié depuis `auth.users`
--
-- L'écran Équipe doit dire QUEL IDENTIFIANT APPARTIENT À QUI. Le schéma `auth`
-- n'est pas exposé par l'API Data : sans cette colonne, la liste afficherait des
-- noms sans pouvoir nommer le compte correspondant.
--
-- Nullable, volontairement : `auth.users.email` l'est aussi (comptes créés par
-- téléphone). Un `not null` ferait LEVER le trigger de création, et GoTrue ne
-- rapporterait qu'un « Database error creating new user » sans autre indice.
--
-- Pas de contrainte d'unicité : `auth.users` l'impose déjà. Un second message
-- d'erreur, formulé autrement, n'aiderait personne.
-- -----------------------------------------------------------------------------
alter table public.profiles add column if not exists email text;

comment on column public.profiles.email is
  'Copie de `auth.users.email`, que l''API Data n''expose pas. Tenue à jour par '
  '`on_auth_user_email_changed` : une copie qui ne se resynchronise pas est pire '
  'que pas de copie — la liste d''équipe afficherait un identifiant faux avec '
  'aplomb.';

update public.profiles p
   set email = u.email
  from auth.users u
 where u.id = p.id
   and p.email is distinct from u.email;

-- -----------------------------------------------------------------------------
-- 2. Un profil naît INACTIF, et son rôle ne vient plus du client
--
-- L'ancien trigger lisait le rôle dans `new.raw_user_meta_data ->> 'role'`.
-- Or la clé publiable est visible dans CHAQUE navigateur : si l'inscription
-- publique était réactivée dans le dashboard, un inconnu pourrait appeler
-- `POST /auth/v1/signup` avec {"data":{"role":"owner"}} et devenir
-- administrateur. La seule défense était un interrupteur qui ne vit nulle part
-- dans ce dépôt.
--
-- Forcer 'staff' ne suffisait pas : `private.is_staff()` accepte TOUT profil
-- actif, sans regarder le rôle. Un inconnu aurait donc lu le catalogue entier,
-- toutes les commandes, tous les noms et téléphones de clients.
--
-- D'où le défaut `false` : un profil né du trigger est INERTE. Le rôle réel et
-- l'activation sont posés ensuite par `createMember`, à travers RLS, sous
-- l'identité de l'administrateur (`profiles_update_owner`). Le bit privilégié
-- ne transite donc jamais par la clé secrète.
--
-- Changer un `default` ne réécrit aucune ligne : les comptes existants restent
-- actifs. `scripts/create-account.mjs` pose `is_active = true` explicitement.
-- -----------------------------------------------------------------------------
alter table public.profiles alter column is_active set default false;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email, role, is_active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email,
    'staff',   -- JAMAIS les métadonnées : elles viennent du client.
    false      -- Inerte tant qu'un administrateur ne l'a pas activé.
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

comment on function public.handle_new_user is
  'Crée le profil qui accompagne un compte auth. Le rôle est TOUJOURS `staff` et '
  'le profil naît inactif : ni l''un ni l''autre ne se lisent dans '
  '`raw_user_meta_data`, qui vient du client. Voir `createMember`.';

-- -----------------------------------------------------------------------------
-- 3. L'e-mail suit son original
--
-- Le seul changement d'e-mail possible aujourd'hui passe par le dashboard
-- Supabase — l'application n'offre aucun écran pour cela. Sans ce trigger, la
-- copie de la section 1 se périmerait en silence.
--
-- AFTER : il écrit une AUTRE table que celle qui le déclenche. Voir la règle
-- posée par `20260910181000_fix_trigger_timing.sql`.
-- -----------------------------------------------------------------------------
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return null;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (new.email is distinct from old.email)
  execute function public.handle_user_email_change();

-- -----------------------------------------------------------------------------
-- 4. Il doit toujours rester un administrateur actif
--
-- `profiles_update_owner` autorise un administrateur à modifier N'IMPORTE QUEL
-- profil, le sien compris. Se rétrograder ou se désactiver soi-même laissait la
-- base SANS AUCUN administrateur — état irrécupérable depuis l'application,
-- puisque seul un administrateur peut écrire dans `profiles`. Il aurait fallu
-- une connexion SQL directe pour s'en sortir.
--
-- POURQUOI `security definer` EST PORTEUR ICI, ET PAS DÉCORATIF
--
-- Une fonction de trigger s'exécute avec les droits de l'APPELANT : le
-- `select` ci-dessous serait donc filtré par `profiles_read`, c'est-à-dire
-- `id = auth.uid() or private.is_owner()`. Quand un administrateur se
-- rétrograde lui-même, `private.is_owner()` est DÉJÀ FAUX au moment où le
-- trigger AFTER s'exécute : la fonction ne verrait que sa propre ligne,
-- compterait zéro administrateur actif, et refuserait l'opération MÊME AVEC
-- trois autres administrateurs en base. Bug silencieux.
--
-- POURQUOI AFTER, ET POURQUOI UNE CLAUSE `WHEN`
--
-- AFTER parce que la fonction lit d'autres lignes que `NEW` — un BEFORE
-- compterait un état que la commande n'a pas fini d'écrire. Les triggers AFTER
-- ROW sont mis en file et exécutés en fin de statement : l'état vu est donc
-- bien l'état final.
--
-- La clause `WHEN` ne déclenche le comptage que lorsqu'une ligne CESSE d'être
-- un administrateur actif. Sans elle, le tout premier compte créé sur une base
-- vide échouerait : l'upsert de `scripts/create-account.mjs` est un UPDATE, et
-- il n'y a alors aucun administrateur à trouver.
--
-- PAS DE `DELETE` : les seules suppressions qui atteignent cette table sont les
-- cascades de `auth.users`. Les bloquer transformerait un `deleteUser` en
-- erreur 500 opaque et casserait la suppression depuis le dashboard. De toute
-- façon, l'application n'a aucune policy DELETE sur `profiles`.
-- -----------------------------------------------------------------------------
create or replace function public.profiles_keep_one_active_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles where role = 'owner' and is_active
  ) then
    raise exception 'last_active_owner'
      using errcode = 'P0001',
            hint = 'Nommez un autre administrateur avant de retirer celui-ci.';
  end if;
  return null;
end;
$$;

drop trigger if exists profiles_keep_one_active_owner_trg on public.profiles;

create trigger profiles_keep_one_active_owner_trg
  after update on public.profiles
  for each row
  when (
    old.role = 'owner' and old.is_active
    and (new.role <> 'owner' or not new.is_active)
  )
  execute function public.profiles_keep_one_active_owner();

-- -----------------------------------------------------------------------------
-- 5. `id` et `email` ne se modifient pas
--
-- `profiles_update_owner` porte sur la ligne entière : un administrateur
-- pourrait y écrire un e-mail qui ne correspond à aucun identifiant réel, et la
-- liste d'équipe mentirait. La vérité vit dans `auth.users` ; ici ce n'est
-- qu'une copie.
--
-- BEFORE, et conforme à la discipline : ce trigger ne touche que `NEW`.
-- -----------------------------------------------------------------------------
create or replace function public.profiles_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.id    := old.id;
  new.email := old.email;
  return new;
end;
$$;

drop trigger if exists profiles_before_update_trg on public.profiles;

create trigger profiles_before_update_trg
  before update on public.profiles
  for each row
  execute function public.profiles_before_update();

-- =============================================================================
-- NOTE — aucune policy n'est ajoutée, et c'est voulu.
--
--   * Pas d'`insert` : les profils naissent du trigger `on_auth_user_created`,
--     qui est `security definer` et ne passe donc pas par RLS.
--   * Pas de `delete` : `orders.created_by` et `expenses.created_by` référencent
--     `profiles(id)` SANS clause `on delete`. Supprimer un compte auth
--     cascaderait sur `profiles` et heurterait cette clé étrangère — GoTrue
--     renverrait un 500 opaque après rollback. Un départ se DÉSACTIVE
--     (`is_active`), il ne se supprime pas : l'historique des commandes doit
--     continuer de nommer qui les a saisies.
-- =============================================================================
