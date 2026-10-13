-- La table notifications et ses policies principales ont été appliquées
-- manuellement avant l'enregistrement de la migration initiale. Cette
-- migration complète uniquement la suppression par le destinataire.
drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications for delete to authenticated using (
    recipient_id = (
        select auth.uid()
    )
    and (
        select private.is_staff()
    )
);