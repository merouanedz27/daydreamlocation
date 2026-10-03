-- =============================================================================
-- Message au client — un texte type, envoyé par WhatsApp depuis les listes
--
-- LE BESOIN
--
-- Depuis « Demain », « Pas rentrés », le tableau des commandes et la fiche,
-- l'équipe écrit au client en un toucher : rappel du retrait la veille du
-- mariage, relance d'un retour en retard. Le texte est TOUJOURS le même à
-- quelques mots près — le propriétaire l'écrit une fois dans « Boutique », et
-- l'app y remplace les champs ({nom}, {date}, {retour}, {reste}…) au moment
-- d'ouvrir WhatsApp.
--
-- POURQUOI SUR `settings` : même raisonnement que les conditions de location
-- (20260913120000) — lu par toute l'équipe, écrit par le propriétaire seul.
-- Les policies `settings_read` / `settings_write` le couvrent SANS CHANGEMENT.
--
-- FACULTATIF : vide, le bouton ouvre la conversation sans texte.
-- =============================================================================

alter table public.settings
  add column customer_message text;

alter table public.settings
  add constraint settings_customer_message_length
    check (char_length(coalesce(customer_message, '')) <= 1000);

comment on column public.settings.customer_message is
  'Message type envoyé au client par WhatsApp. Champs remplacés : {nom} {numero} {date} {retrait} {retour} {reste}.';
