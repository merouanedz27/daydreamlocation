-- =============================================================================
-- Coordonnées de la boutique et conditions de location — pour le bon imprimé
--
-- LE BESOIN
--
-- Le client veut imprimer un BON DE LOCATION par commande, à remettre ou à
-- envoyer au client. Un bon sans adresse, sans téléphone et sans conditions
-- (caution, retard, dégâts) n'engage personne : c'est ce qui en fait un
-- document, et non une capture d'écran.
--
-- POURQUOI SUR `settings`
--
-- C'est la ligne UNIQUE des réglages de la boutique, déjà protégée comme il
-- faut : lecture par toute l'équipe (un employé imprime des bons), écriture
-- par le propriétaire seul. Les policies `settings_read` / `settings_write`
-- couvrent donc ces colonnes SANS AUCUN CHANGEMENT de RLS.
--
-- DEUX TEXTES DE CONDITIONS, un par langue : le bon s'imprime dans la langue
-- de l'écran, et le propriétaire doit pouvoir rédiger les deux quelle que soit
-- la sienne. Une traduction automatique d'un texte qui engage n'est pas une
-- option.
--
-- Toutes les colonnes sont FACULTATIVES : un bloc vide ne s'imprime pas.
-- =============================================================================

alter table public.settings
  add column shop_address    text,
  add column shop_phone      text,
  add column rental_terms_fr text,
  add column rental_terms_ar text;

-- Des bornes plutôt que rien : ces textes finissent sur une feuille A4, et un
-- collage accidentel de plusieurs pages ne doit pas casser la mise en page.
alter table public.settings
  add constraint settings_shop_lengths check (
    char_length(coalesce(shop_address, ''))    <= 300
    and char_length(coalesce(shop_phone, ''))      <= 40
    and char_length(coalesce(rental_terms_fr, '')) <= 3000
    and char_length(coalesce(rental_terms_ar, '')) <= 3000
  );

comment on column public.settings.shop_address is
  'Adresse imprimée en tête du bon de location.';
comment on column public.settings.rental_terms_fr is
  'Conditions de location imprimées sur le bon en français. Vide = bloc omis.';
comment on column public.settings.rental_terms_ar is
  'Conditions de location imprimées sur le bon en arabe. Vide = bloc omis.';
