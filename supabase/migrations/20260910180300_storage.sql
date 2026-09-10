-- =============================================================================
-- Stockage des photos du stock
--
-- Bucket public en LECTURE : les photos de costumes ne sont pas des données
-- sensibles, et un bucket public évite de signer une URL par vignette dans des
-- listes de plusieurs dizaines de pièces (le gain de latence est net sur un
-- téléphone en 3G). L'ÉCRITURE reste réservée à l'équipe connectée.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'articles',
  'articles',
  true,
  5242880, -- 5 Mo : une photo prise au téléphone tient largement dedans
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do nothing;

-- Lecture publique (le bucket est public, la policy rend l'intention explicite).
create policy articles_public_read on storage.objects
  for select to public
  using (bucket_id = 'articles');

-- Ajout d'une photo : toute l'équipe connectée (upload depuis l'appareil photo).
create policy articles_staff_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'articles' and (select private.is_staff()));

create policy articles_staff_update on storage.objects
  for update to authenticated
  using (bucket_id = 'articles' and (select private.is_staff()))
  with check (bucket_id = 'articles' and (select private.is_staff()));

-- Suppression : propriétaire seul. Une photo effacée par erreur est perdue.
create policy articles_owner_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'articles' and (select private.is_owner()));
