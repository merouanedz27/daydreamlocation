-- =============================================================================
-- Données de démonstration
--
--   node scripts/run-sql.mjs supabase/seed.sql
--
-- Reprend le vocabulaire réel du tableur du client : références fournisseur
-- « Gio-079 » et « TK-405 », longueur en centimètres, veste et pantalon de
-- tailles différentes sur une même commande.
--
-- Idempotent : rejouable sans créer de doublons. Ne touche pas aux comptes.
-- =============================================================================

-- --- modèles -----------------------------------------------------------------
insert into public.article_models (ref_code, name_fr, name_ar, category_id, color, brand, base_price)
values
  ('Gio-079', 'Veste Slim Bleu Nuit', 'سترة زرقاء داكنة',
   (select id from public.categories where slug = 'veste'), 'Bleu nuit', 'Giovanni', 3000),
  ('TK-405', 'Veste Beige', 'سترة بيج',
   (select id from public.categories where slug = 'veste'), 'Beige', 'TK', 3200),
  ('Gio-079-P', 'Pantalon Bleu Nuit', 'سروال أزرق داكن',
   (select id from public.categories where slug = 'pantalon'), 'Bleu nuit', 'Giovanni', 1500),
  ('TK-405-P', 'Pantalon Beige', 'سروال بيج',
   (select id from public.categories where slug = 'pantalon'), 'Beige', 'TK', 1600),
  ('CHM-BLEU', 'Chemise Bleue', 'قميص أزرق',
   (select id from public.categories where slug = 'chemise'), 'Bleu', null, 900),
  ('CHM-BLANC', 'Chemise Blanche', 'قميص أبيض',
   (select id from public.categories where slug = 'chemise'), 'Blanc', null, 900),
  ('CHS-NOIR', 'Chaussures Noires Argent', 'حذاء أسود فضي',
   (select id from public.categories where slug = 'chaussures'), 'Noir', null, 1200)
on conflict (ref_code) do nothing;

-- --- pièces physiques ---------------------------------------------------------
-- Plusieurs exemplaires d'un même modèle, en tailles différentes : c'est ce qui
-- permet de savoir LAQUELLE des deux vestes taille 50 est partie.
insert into public.article_units (model_id, ref_code, size, length_cm, purchase_price)
select m.id, v.ref, v.size, v.len, v.cost
from (values
  ('Gio-079',   'Gio-079-01',   '48', 90.0, 12000),
  ('Gio-079',   'Gio-079-02',   '50', 90.0, 12000),
  ('Gio-079',   'Gio-079-03',   '50', 92.0, 12000),
  ('Gio-079',   'Gio-079-04',   '52', 92.0, 12000),
  ('TK-405',    'TK-405-01',    '50', 90.0, 13000),
  ('TK-405',    'TK-405-02',    '52', 90.0, 13000),
  ('Gio-079-P', 'Gio-079-P-01', '50', null,  4000),
  ('Gio-079-P', 'Gio-079-P-02', '52', null,  4000),
  ('TK-405-P',  'TK-405-P-01',  '50', null,  4200),
  ('CHM-BLEU',  'CHM-BLEU-01',  'M',  null,  1800),
  ('CHM-BLEU',  'CHM-BLEU-02',  'L',  null,  1800),
  ('CHM-BLANC', 'CHM-BLANC-01', 'M',  null,  1800),
  ('CHM-BLANC', 'CHM-BLANC-02', 'L',  null,  1800),
  ('CHS-NOIR',  'CHS-NOIR-01',  '42', null,  3500),
  ('CHS-NOIR',  'CHS-NOIR-02',  '43', null,  3500)
) as v(model_ref, ref, size, len, cost)
join public.article_models m on m.ref_code = v.model_ref
on conflict (ref_code) do nothing;

-- --- ensembles ----------------------------------------------------------------
-- « Costume n°12 » : un raccourci de saisie, jamais une unité louable.
insert into public.ensembles (name, description, package_price)
select 'Costume n°12 — Bleu Nuit', 'Veste + pantalon + chemise bleue', 5000
where not exists (select 1 from public.ensembles where name = 'Costume n°12 — Bleu Nuit');

insert into public.ensembles (name, description, package_price)
select 'Costume n°7 — Beige', 'Veste + pantalon + chemise blanche', 5200
where not exists (select 1 from public.ensembles where name = 'Costume n°7 — Beige');

insert into public.ensemble_items (ensemble_id, unit_id)
select e.id, u.id
from public.ensembles e
join public.article_units u
  on u.ref_code in ('Gio-079-02', 'Gio-079-P-01', 'CHM-BLEU-01')
where e.name = 'Costume n°12 — Bleu Nuit'
on conflict do nothing;

insert into public.ensemble_items (ensemble_id, unit_id)
select e.id, u.id
from public.ensembles e
join public.article_units u
  on u.ref_code in ('TK-405-01', 'TK-405-P-01', 'CHM-BLANC-01')
where e.name = 'Costume n°7 — Beige'
on conflict do nothing;

select
  (select count(*) from public.article_models) as modeles,
  (select count(*) from public.article_units)  as pieces,
  (select count(*) from public.ensembles)      as ensembles;
