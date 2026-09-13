-- =============================================================================
-- L'e-mail recopié ne suivait PAS son original
--
-- `20260913100000_equipe.sql` a posé deux triggers qui se contredisaient :
--
--   * `on_auth_user_email_changed` (sur `auth.users`) recopie le nouvel e-mail
--     dans `profiles` ;
--   * `profiles_before_update_trg` (sur `profiles`) remet `new.email := old.email`
--     à CHAQUE update, pour que l'application ne puisse pas l'écrire.
--
-- Le second annulait donc le premier : un e-mail changé dans le dashboard
-- Supabase restait l'ancien dans la liste d'équipe. Attrapé par le test 2 de
-- `supabase/tests/team.sql`.
--
-- LA CORRECTION — `pg_trigger_depth()`
--
-- Un update venu de l'application (PostgREST, sous RLS) atteint ce trigger à la
-- profondeur 1. La recopie, elle, est un update lancé PAR un trigger sur
-- `auth.users` : elle l'atteint à la profondeur 2. On n'épingle donc l'e-mail
-- qu'à la profondeur 1.
--
-- Rien de contournable depuis le navigateur : un client ne peut ni déclencher
-- un trigger sur `auth.users`, ni exécuter de SQL qui en imbrique un.
--
-- `id` reste épinglé dans tous les cas : aucune voie légitime ne le change.
-- =============================================================================

create or replace function public.profiles_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.id := old.id;
  if pg_trigger_depth() = 1 then
    new.email := old.email;
  end if;
  return new;
end;
$$;

comment on function public.profiles_before_update is
  'Épingle `id` toujours, et `email` pour tout update DIRECT (profondeur 1). '
  'La recopie depuis `auth.users` arrive à la profondeur 2 et passe : sans cette '
  'exception, l''e-mail de la liste d''équipe ne se mettait jamais à jour.';
