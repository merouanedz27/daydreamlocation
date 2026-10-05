-- Import du stock du 2026-10-05 (2) : chaussures — Cordon, Achv, Bligha, Zara.
-- Données, pas schéma. Rejouable sans doublon (on conflict do nothing).
--   node scripts/run-sql.mjs supabase/data/import_chaussures_20261005.sql

begin;

insert into public.article_models (ref_code, name_fr, category_id, color, base_price)
select v.ref_code, v.name_fr, c.id, v.color, 0
from (values
  ('CRD-MAT', 'Cordon Mat', 'Noir'),
  ('CRD-GLACE-S', 'Cordon Glacé Simple', 'Noir'),
  ('CRD-GLACE-RAY', 'Cordon Glacé à Rayures', 'Noir'),
  ('ACHV-ARGENT', 'Achv Argent', 'Argent'),
  ('ACHV-DORE', 'Achv Doré', 'Doré'),
  ('ACHV-MARRON-F', 'Achv Marron Foncé', 'Marron foncé'),
  ('ACHV-MARRON-C', 'Achv Marron Clair', 'Marron clair'),
  ('ACHV-DEMI-MAT', 'Achv Demi Mat', null),
  ('BLG-BEIGE', 'Bligha Beige', 'Beige'),
  ('BLG-BLANC', 'Bligha Blanc', 'Blanc'),
  ('BLG-JAUNE', 'Bligha Jaune', 'Jaune'),
  ('ZARA-NOIR-MAT', 'Zara Noir Mat', 'Noir')
) as v(ref_code, name_fr, color)
join public.categories c on c.slug = 'chaussures'
on conflict (ref_code) do nothing;

insert into public.article_units (model_id, ref_code, size)
select m.id, v.ref_code, v.size
from (values
  ('CRD-MAT', 'CRD-MAT-01', '39'),
  ('CRD-MAT', 'CRD-MAT-02', '40'),
  ('CRD-MAT', 'CRD-MAT-03', '41'),
  ('CRD-MAT', 'CRD-MAT-04', '42'),
  ('CRD-MAT', 'CRD-MAT-05', '43'),
  ('CRD-MAT', 'CRD-MAT-06', '44'),
  ('CRD-GLACE-S', 'CRD-GLACE-S-01', '39'),
  ('CRD-GLACE-S', 'CRD-GLACE-S-02', '40'),
  ('CRD-GLACE-S', 'CRD-GLACE-S-03', '41'),
  ('CRD-GLACE-S', 'CRD-GLACE-S-04', '42'),
  ('CRD-GLACE-S', 'CRD-GLACE-S-05', '43'),
  ('CRD-GLACE-S', 'CRD-GLACE-S-06', '44'),
  ('CRD-GLACE-RAY', 'CRD-GLACE-RAY-01', '39'),
  ('CRD-GLACE-RAY', 'CRD-GLACE-RAY-02', '40'),
  ('CRD-GLACE-RAY', 'CRD-GLACE-RAY-03', '41'),
  ('CRD-GLACE-RAY', 'CRD-GLACE-RAY-04', '42'),
  ('CRD-GLACE-RAY', 'CRD-GLACE-RAY-05', '43'),
  ('CRD-GLACE-RAY', 'CRD-GLACE-RAY-06', '44'),
  ('ACHV-ARGENT', 'ACHV-ARGENT-01', '39'),
  ('ACHV-ARGENT', 'ACHV-ARGENT-02', '40'),
  ('ACHV-ARGENT', 'ACHV-ARGENT-03', '41'),
  ('ACHV-ARGENT', 'ACHV-ARGENT-04', '42'),
  ('ACHV-ARGENT', 'ACHV-ARGENT-05', '43'),
  ('ACHV-ARGENT', 'ACHV-ARGENT-06', '44'),
  ('ACHV-DORE', 'ACHV-DORE-01', '39'),
  ('ACHV-DORE', 'ACHV-DORE-02', '40'),
  ('ACHV-DORE', 'ACHV-DORE-03', '41'),
  ('ACHV-DORE', 'ACHV-DORE-04', '42'),
  ('ACHV-DORE', 'ACHV-DORE-05', '43'),
  ('ACHV-DORE', 'ACHV-DORE-06', '44'),
  ('ACHV-MARRON-F', 'ACHV-MARRON-F-01', '39'),
  ('ACHV-MARRON-F', 'ACHV-MARRON-F-02', '40'),
  ('ACHV-MARRON-F', 'ACHV-MARRON-F-03', '41'),
  ('ACHV-MARRON-F', 'ACHV-MARRON-F-04', '42'),
  ('ACHV-MARRON-F', 'ACHV-MARRON-F-05', '43'),
  ('ACHV-MARRON-F', 'ACHV-MARRON-F-06', '44'),
  ('ACHV-MARRON-C', 'ACHV-MARRON-C-01', '39'),
  ('ACHV-MARRON-C', 'ACHV-MARRON-C-02', '40'),
  ('ACHV-MARRON-C', 'ACHV-MARRON-C-03', '41'),
  ('ACHV-MARRON-C', 'ACHV-MARRON-C-04', '42'),
  ('ACHV-MARRON-C', 'ACHV-MARRON-C-05', '43'),
  ('ACHV-MARRON-C', 'ACHV-MARRON-C-06', '44'),
  ('ACHV-DEMI-MAT', 'ACHV-DEMI-MAT-01', '39'),
  ('ACHV-DEMI-MAT', 'ACHV-DEMI-MAT-02', '40'),
  ('ACHV-DEMI-MAT', 'ACHV-DEMI-MAT-03', '41'),
  ('ACHV-DEMI-MAT', 'ACHV-DEMI-MAT-04', '42'),
  ('ACHV-DEMI-MAT', 'ACHV-DEMI-MAT-05', '43'),
  ('ACHV-DEMI-MAT', 'ACHV-DEMI-MAT-06', '44'),
  ('BLG-BEIGE', 'BLG-BEIGE-01', '42'),
  ('BLG-BEIGE', 'BLG-BEIGE-02', '43'),
  ('BLG-BEIGE', 'BLG-BEIGE-03', '43'),
  ('BLG-BEIGE', 'BLG-BEIGE-04', '43'),
  ('BLG-BEIGE', 'BLG-BEIGE-05', '44'),
  ('BLG-BEIGE', 'BLG-BEIGE-06', '44'),
  ('BLG-BEIGE', 'BLG-BEIGE-07', '45'),
  ('BLG-BLANC', 'BLG-BLANC-01', '43'),
  ('BLG-BLANC', 'BLG-BLANC-02', '44'),
  ('BLG-JAUNE', 'BLG-JAUNE-01', '43'),
  ('BLG-JAUNE', 'BLG-JAUNE-02', '44'),
  ('BLG-JAUNE', 'BLG-JAUNE-03', '44'),
  ('ZARA-NOIR-MAT', 'ZARA-NOIR-MAT-01', '43')
) as v(model_ref, ref_code, size)
join public.article_models m on m.ref_code = v.model_ref
on conflict (ref_code) do nothing;

select (select count(*) from public.article_models where ref_code = any (array['CRD-MAT', 'CRD-GLACE-S', 'CRD-GLACE-RAY', 'ACHV-ARGENT', 'ACHV-DORE', 'ACHV-MARRON-F', 'ACHV-MARRON-C', 'ACHV-DEMI-MAT', 'BLG-BEIGE', 'BLG-BLANC', 'BLG-JAUNE', 'ZARA-NOIR-MAT'])) as nouveaux_modeles,
       (select count(*) from public.article_units u join public.article_models m on m.id = u.model_id where m.ref_code = any (array['CRD-MAT', 'CRD-GLACE-S', 'CRD-GLACE-RAY', 'ACHV-ARGENT', 'ACHV-DORE', 'ACHV-MARRON-F', 'ACHV-MARRON-C', 'ACHV-DEMI-MAT', 'BLG-BEIGE', 'BLG-BLANC', 'BLG-JAUNE', 'ZARA-NOIR-MAT'])) as nouvelles_pieces;

commit;
