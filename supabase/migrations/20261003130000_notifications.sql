-- =============================================================================
-- Notifications par e-mail de l'équipe.
--
-- Trois envois (voir `src/lib/email/`) :
--   - le message écrit par l'administrateur, à toute l'équipe ou à quelques-uns ;
--   - « Nouvelle commande », à chaque commande saisie (sauf à celui qui l'a saisie) ;
--   - « Demain », chaque soir, la liste des mariages du lendemain.
--
-- Les deux envois automatiques se coupent membre par membre. Réglés par
-- l'administrateur, par la policy existante `profiles_update_owner` : aucune
-- nouvelle policy, RLS reste ce qu'elle était.
-- =============================================================================

alter table public.profiles
  add column if not exists notify_new_order boolean not null default true,
  add column if not exists notify_daily boolean not null default true,
  add column if not exists email_locale text not null default 'fr';

alter table public.profiles drop constraint if exists profiles_email_locale_valid;
alter table public.profiles
  add constraint profiles_email_locale_valid check (email_locale in ('fr', 'ar'));

comment on column public.profiles.notify_new_order is
  'Reçoit un e-mail à chaque nouvelle commande saisie par un collègue.';
comment on column public.profiles.notify_daily is
  'Reçoit chaque soir la liste des mariages du lendemain.';
comment on column public.profiles.email_locale is
  'Langue des e-mails reçus : fr ou ar.';
