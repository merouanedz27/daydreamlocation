-- Deux catégories réellement louées par le client.
--
-- `costume` : veste + pantalon loués ENSEMBLE, une seule pièce physique par
-- taille (Invités, Tuxedos). Distinct de `veste`/`pantalon`, qui restent pour
-- les costumes dont les deux parties se louent séparément.
-- `barnous` : le burnous du marié, taille unique.
insert into public.categories (slug, name_fr, name_ar, position) values
  ('costume', 'Costume', 'بدلة',   0),
  ('barnous', 'Burnous', 'برنوس', 8)
on conflict (slug) do nothing;
