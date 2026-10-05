-- La bligha (babouche traditionnelle) a son propre filtre dans le stock,
-- distincte des chaussures de ville. Placée juste après « Chaussures » : les
-- catégories suivantes reculent d'un rang (le tri se fait sur `position`).
update public.categories set position = position + 1
where position > 5
  and not exists (select 1 from public.categories where slug = 'bligha');

insert into public.categories (slug, name_fr, name_ar, position) values
  ('bligha', 'Bligha', 'بلغة', 6)
on conflict (slug) do nothing;

-- Les blighas importées le 2026-10-05 (BLG-*) quittent « Chaussures ».
update public.article_models
set category_id = (select id from public.categories where slug = 'bligha')
where ref_code like 'BLG-%'
  and category_id = (select id from public.categories where slug = 'chaussures');
