-- =============================================================================
-- Notifications « calmes » :
--   * un seul résumé quotidien par membre (`daily_summary`) au lieu d'une
--     alerte par commande, par membre et par jour ;
--   * la cloche se met à jour en direct via Supabase Realtime. Les événements
--     passent par la policy `notifications_read_own` : chacun ne reçoit que
--     les siens.
-- Les anciens types restent valides pour les lignes déjà enregistrées.
-- =============================================================================
alter table public.notifications drop constraint notifications_kind_valid;
alter table public.notifications
add constraint notifications_kind_valid check (
    kind in (
        'order_created',
        'order_updated',
        'order_cancelled',
        'order_restored',
        'tomorrow',
        'return_due',
        'return_late',
        'daily_summary'
    )
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
