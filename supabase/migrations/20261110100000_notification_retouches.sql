-- =============================================================================
-- Notification « Retouches terminées » (`alterations_done`).
--
-- Quand le tailleur scanne le DERNIER pantalon d'une commande, toute l'équipe
-- du magasin reçoit une ligne dans la cloche (et un push) — en plus de
-- l'e-mail aux administrateurs, envoyé à chaque scan. La ligne est créée côté
-- Next.js (src/lib/notifications/service.ts) : `mark_altered` ne change pas.
--
-- Compatible avec v1.0.0-stable : la contrainte ne fait que s'élargir.
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
        'daily_summary',
        'alterations_done'
    )
);

-- La règle par défaut (cloche + push), lisible dans la ligne des réglages.
-- Sans elle, `parseRules` retomberait de toute façon sur « tout activé ».
update public.settings
set notification_rules = notification_rules
    || '{"alterations_done": {"bell": true, "push": true}}'::jsonb
where not notification_rules ? 'alterations_done';
