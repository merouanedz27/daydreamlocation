-- =============================================================================
-- Réglages des notifications, sur la ligne unique `settings` :
--
--   * notification_rules — pour chaque événement, la cloche et le push
--     peuvent être coupés séparément. La valeur par défaut reprend le
--     comportement d'avant cette migration (tout activé ; le push d'une
--     modification ne part que si la date, les pièces ou le prix changent).
--   * email_texts — objet et phrase d'introduction des deux e-mails
--     automatiques, en français et en arabe. Vide = texte par défaut.
--
-- Les policies de `settings` ne changent pas : toute l'équipe lit, seul le
-- propriétaire écrit. Le serveur lit ces réglages par la clé secrète au moment
-- d'envoyer.
-- =============================================================================
alter table public.settings
add column notification_rules jsonb not null default '{
    "order_created":   {"bell": true, "push": true},
    "order_updated":   {"bell": true, "push": true},
    "order_cancelled": {"bell": true, "push": true},
    "order_restored":  {"bell": true, "push": true},
    "daily_summary":   {"bell": true, "push": true}
  }'::jsonb,
add column email_texts jsonb not null default '{}'::jsonb;

alter table public.settings
add constraint settings_notification_rules_object check (
    jsonb_typeof(notification_rules) = 'object'
    and pg_column_size(notification_rules) < 4000
),
add constraint settings_email_texts_object check (
    jsonb_typeof(email_texts) = 'object'
    and pg_column_size(email_texts) < 16000
);

comment on column public.settings.notification_rules is
  'Par événement : {"bell": bool, "push": bool}. Lu par src/lib/notifications/service.ts.';
comment on column public.settings.email_texts is
  'Textes des e-mails automatiques : {new_order|daily: {fr|ar: {subject, intro}}}. Vide = texte par défaut.';
