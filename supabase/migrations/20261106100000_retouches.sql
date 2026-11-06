-- =============================================================================
-- RETOUCHES — le tailleur entre dans l'application.
--
-- Jusqu'ici une retouche était une note libre (« Tailleur ») posée sur la
-- première ligne de la commande : rien ne disait QUELLE pièce, ni si elle
-- était faite. Désormais :
--
--   1. chaque PIÈCE d'une commande peut porter une retouche (`line_alterations`) ;
--   2. une étiquette QR est collée sur le vêtement ;
--   3. le TAILLEUR — un compte à lui, rôle `tailleur` — scanne l'étiquette
--      quand c'est fait : la pièce passe « taillée », le propriétaire reçoit
--      un e-mail (côté Next.js).
--
-- LE TAILLEUR NE VOIT RIEN D'AUTRE. `private.is_staff()` acceptait tout profil
-- actif ; il exclut désormais `tailleur`. D'un seul geste, toutes les policies
-- existantes (commandes, lignes, stock, frais…) lui ferment la porte. Il ne
-- passe que par deux fonctions SECURITY DEFINER qui ne rendent que ce qu'il
-- doit lire : client, pièce, taille, retouche, date — jamais un prix ni un
-- téléphone.
--
-- POURQUOI `order_id` ET un `order_line_id` NULLABLE : `update_order` SUPPRIME
-- et RÉINSÈRE toutes les lignes à chaque modification. Une retouche liée à la
-- ligne par `on delete cascade` disparaîtrait — avec l'étiquette déjà collée.
-- Elle survit donc (`on delete set null`), et `insert_order_lines` la
-- RATTACHE à la nouvelle ligne grâce à l'`id` que le formulaire renvoie. Celles
-- restées orphelines (pièce retirée, case décochée) sont supprimées.
-- =============================================================================

-- --- 1. Le rôle --------------------------------------------------------------
alter table public.profiles drop constraint profiles_role_valid;
alter table public.profiles
  add constraint profiles_role_valid
  check (role in ('owner', 'moderator', 'staff', 'tailleur'));

-- Membre actif de l'ÉQUIPE DU MAGASIN. Le tailleur n'en fait pas partie.
create or replace function private.is_staff()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and role in ('owner', 'moderator', 'staff')
      and is_active
  );
$$;

-- Équipe du magasin OU tailleur : les deux peuvent lire la liste des
-- retouches et marquer une pièce taillée.
create or replace function private.is_tailor_or_staff()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and role in ('owner', 'moderator', 'staff', 'tailleur')
      and is_active
  );
$$;

revoke execute on function private.is_tailor_or_staff() from public, anon;
grant execute on function private.is_tailor_or_staff() to authenticated;

-- --- 2. La table --------------------------------------------------------------
create table public.line_alterations (
  id uuid primary key default gen_random_uuid(),
  order_id bigint not null references public.orders (id) on delete cascade,
  order_line_id bigint unique references public.order_lines (id) on delete set null,
  note text not null,
  status text not null default 'a_faire',
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  done_at timestamptz,
  done_by uuid references public.profiles (id) on delete set null,
  printed_at timestamptz,
  constraint line_alterations_note_valid
    check (note = btrim(note) and char_length(note) between 1 and 200),
  constraint line_alterations_status_valid
    check (status in ('a_faire', 'taillee')),
  constraint line_alterations_done_coherent
    check ((status = 'taillee') = (done_at is not null))
);

comment on table public.line_alterations is
  'Retouche d''une pièce de commande, chez le tailleur. L''id est encodé dans l''étiquette QR collée sur le vêtement.';
comment on column public.line_alterations.order_line_id is
  'Ligne actuelle. NULL un instant pendant update_order (lignes réinsérées), puis rattachée ou supprimée.';
comment on column public.line_alterations.printed_at is
  'Étiquette imprimée : « Imprimer les nouvelles » ne reprend que celles où c''est NULL.';

create index line_alterations_order_id_idx on public.line_alterations (order_id);
create index line_alterations_pending_idx
  on public.line_alterations (created_at) where status = 'a_faire';
create index line_alterations_done_at_idx
  on public.line_alterations (done_at) where status = 'taillee';
create index line_alterations_created_by_idx
  on public.line_alterations (created_by) where created_by is not null;
create index line_alterations_done_by_idx
  on public.line_alterations (done_by) where done_by is not null;

alter table public.line_alterations enable row level security;

-- L'équipe du magasin lit et écrit directement. Le tailleur : aucune policy,
-- il passe par list_alterations() / mark_altered().
create policy line_alterations_select on public.line_alterations
  for select to authenticated using ((select private.is_staff()));
create policy line_alterations_insert on public.line_alterations
  for insert to authenticated with check ((select private.is_staff()));
create policy line_alterations_update on public.line_alterations
  for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));
create policy line_alterations_delete on public.line_alterations
  for delete to authenticated using ((select private.is_staff()));

-- --- 3. Rattacher les retouches aux lignes d'une commande ----------------------
-- `p_lines` est le même tableau que celui de `insert_order_lines`. Chaque
-- élément peut porter `alteration: { id?: uuid, note: text }`.
--
-- Les lignes de la commande viennent TOUTES d'être insérées (create_order :
-- nouvelle commande ; update_order : anciennes lignes supprimées juste avant),
-- dans l'ordre du tableau : la n-ième ligne par `id` est le n-ième élément.
create or replace function private.sync_line_alterations(p_order_id bigint, p_lines jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r record;
  v_note text;
  v_id uuid;
  v_old_note text;
begin
  for r in
    select e.value as line, l.id as line_id
    from jsonb_array_elements(p_lines) with ordinality as e(value, n)
    join (
      select ol.id, row_number() over (order by ol.id) as n
      from public.order_lines ol
      where ol.order_id = p_order_id
    ) l on l.n = e.n
  loop
    v_note := left(nullif(btrim(coalesce(r.line->'alteration'->>'note', '')), ''), 200);
    continue when v_note is null;
    v_note := btrim(v_note);

    -- Un id d'une AUTRE commande est ignoré : on n'emprunte pas une étiquette.
    v_id := null;
    if coalesce(r.line->'alteration'->>'id', '') ~ '^[0-9a-fA-F-]{36}$' then
      select a.id, a.note into v_id, v_old_note
      from public.line_alterations a
      where a.id = (r.line->'alteration'->>'id')::uuid
        and a.order_id = p_order_id;
    end if;

    if v_id is not null then
      update public.line_alterations a set
        order_line_id = r.line_id,
        note = v_note,
        -- Retouche CHANGÉE : à refaire, et l'étiquette est à réimprimer.
        status     = case when v_old_note = v_note then a.status     else 'a_faire' end,
        done_at    = case when v_old_note = v_note then a.done_at    else null end,
        done_by    = case when v_old_note = v_note then a.done_by    else null end,
        printed_at = case when v_old_note = v_note then a.printed_at else null end
      where a.id = v_id;
    else
      insert into public.line_alterations (order_id, order_line_id, note, created_by)
      values (p_order_id, r.line_id, v_note, (select auth.uid()));
    end if;
  end loop;

  -- Pièce retirée de la commande ou case « Retouche » décochée.
  delete from public.line_alterations
  where order_id = p_order_id and order_line_id is null;
end;
$$;

revoke all on function private.sync_line_alterations(bigint, jsonb) from public, anon;
grant execute on function private.sync_line_alterations(bigint, jsonb) to authenticated;

-- `insert_order_lines` est appelée par create_order et update_order (par son
-- NOM, résolu à l'exécution). On garde le corps existant sous un autre nom et
-- on l'enveloppe : aucune des deux fonctions n'a à être réécrite.
alter function private.insert_order_lines(bigint, jsonb) rename to insert_order_lines_core;

create function private.insert_order_lines(p_order_id bigint, p_lines jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.insert_order_lines_core(p_order_id, p_lines);
  perform private.sync_line_alterations(p_order_id, p_lines);
end;
$$;

comment on function private.insert_order_lines is
'Insère les lignes d''une commande (insert_order_lines_core) puis rattache leurs retouches (sync_line_alterations).';

revoke all on function private.insert_order_lines(bigint, jsonb) from public, anon;
grant execute on function private.insert_order_lines(bigint, jsonb) to authenticated;

-- --- 4. Ce que le tailleur peut lire --------------------------------------------
-- Pas de prix, pas de téléphone. `p_id` : une seule retouche (page d'un scan).
create or replace function public.list_alterations(
  p_status text default 'a_faire',
  p_id uuid default null,
  p_done_since timestamptz default null
)
returns table (
  id uuid,
  status text,
  note text,
  created_at timestamptz,
  done_at timestamptz,
  printed_at timestamptz,
  done_by_name text,
  order_id bigint,
  order_no text,
  order_status text,
  customer_name text,
  event_date date,
  pickup_date date,
  model_name text,
  ref_code text,
  size text,
  piece_kind text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not (select private.is_tailor_or_staff()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select
    a.id, a.status, a.note, a.created_at, a.done_at, a.printed_at,
    p.full_name,
    o.id, o.order_no, o.status, o.customer_name, o.event_date, o.pickup_date,
    coalesce(l.model_name_snapshot, l.external_label),
    u.ref_code,
    l.size_snapshot,
    coalesce(u.part, c.slug)
  from public.line_alterations a
  join public.orders o on o.id = a.order_id
  left join public.order_lines l on l.id = a.order_line_id
  left join public.article_units u on u.id = l.unit_id
  left join public.article_models m on m.id = u.model_id
  left join public.categories c on c.id = m.category_id
  left join public.profiles p on p.id = a.done_by
  where a.order_line_id is not null
    and (p_id is null or a.id = p_id)
    and (p_id is not null or a.status = p_status)
    -- Une commande annulée ne part plus chez le tailleur.
    and (p_id is not null or a.status = 'taillee' or o.status <> 'annulee')
    and (p_done_since is null or a.done_at >= p_done_since)
  order by
    case when a.status = 'a_faire' then o.event_date end asc nulls last,
    a.done_at desc nulls last,
    o.order_no, l.id;
end;
$$;

revoke all on function public.list_alterations(text, uuid, timestamptz) from public, anon;
grant execute on function public.list_alterations(text, uuid, timestamptz) to authenticated;

comment on function public.list_alterations is
  'Retouches lisibles par l''équipe ET le tailleur : client, pièce, taille, retouche, dates. Jamais d''argent.';

-- --- 5. Marquer une pièce taillée ------------------------------------------------
-- Idempotente : un second scan rend `already_done = true` et ne change rien —
-- côté Next.js, pas de second e-mail.
create or replace function public.mark_altered(p_id uuid)
returns table (
  already_done boolean,
  order_id bigint,
  order_no text,
  customer_name text,
  event_date date,
  note text,
  model_name text,
  ref_code text,
  size text,
  done_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_status text;
  v_order_status text;
  v_line bigint;
begin
  if not (select private.is_tailor_or_staff()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select a.status, o.status, a.order_line_id
    into v_status, v_order_status, v_line
  from public.line_alterations a
  join public.orders o on o.id = a.order_id
  where a.id = p_id
  for update of a;

  if not found or v_line is null then
    raise exception 'alteration_not_found' using errcode = 'P0002';
  end if;
  if v_order_status = 'annulee' and v_status = 'a_faire' then
    raise exception 'order_cancelled' using errcode = '22023';
  end if;

  if v_status = 'a_faire' then
    update public.line_alterations a
    set status = 'taillee', done_at = now(), done_by = (select auth.uid())
    where a.id = p_id;
  end if;

  return query
  select
    v_status = 'taillee',
    o.id, o.order_no, o.customer_name, o.event_date,
    a.note,
    coalesce(l.model_name_snapshot, l.external_label),
    u.ref_code,
    l.size_snapshot,
    a.done_at
  from public.line_alterations a
  join public.orders o on o.id = a.order_id
  left join public.order_lines l on l.id = a.order_line_id
  left join public.article_units u on u.id = l.unit_id
  where a.id = p_id;
end;
$$;

revoke all on function public.mark_altered(uuid) from public, anon;
grant execute on function public.mark_altered(uuid) to authenticated;

comment on function public.mark_altered is
  'Le tailleur (ou l''équipe) marque une retouche faite. Idempotente : already_done = true si elle l''était déjà.';

-- --- 6. Reprise des anciennes notes « Tailleur » ----------------------------------
-- Toutes les notes deviennent des retouches. Celles d'une commande à venir,
-- pas encore partie, sont À FAIRE ; les autres sont réputées faites — la
-- tenue est sortie ou l'événement est passé. `line_note` reste en base :
-- l'historique garde son texte, l'application ne l'écrit plus.
insert into public.line_alterations (order_id, order_line_id, note, status, created_at, done_at, printed_at)
select
  l.order_id,
  l.id,
  btrim(left(btrim(l.line_note), 200)),
  case when pending then 'a_faire' else 'taillee' end,
  o.created_at,
  case when pending then null else greatest(o.created_at, coalesce(o.pickup_date, o.event_date)::timestamptz) end,
  case when pending then null else now() end
from public.order_lines l
join public.orders o on o.id = l.order_id
cross join lateral (
  select o.status <> 'annulee' and not o.picked_up and o.event_date >= current_date as pending
) s
where nullif(btrim(l.line_note), '') is not null;
