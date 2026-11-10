-- Le magasin peut RETIRER une pièce taillée de l'onglet « Taillées ».
--
-- Ce n'est pas une suppression : la retouche reste sur la commande (fiche,
-- bon, historique) et son étiquette QR continue de répondre. `hidden_at` la
-- sort seulement de la liste. L'équipe l'écrit par la policy existante
-- `line_alterations_update` (is_staff) ; le tailleur n'a toujours aucun accès.
--
-- Compatible avec le code de `v1.0.0-stable` : colonne facultative, fonctions
-- aux mêmes signatures.

-- --- 1. La colonne ---------------------------------------------------------------
alter table public.line_alterations add column hidden_at timestamptz;

comment on column public.line_alterations.hidden_at is
  'Retirée de l''onglet « Taillées » par le magasin. La retouche reste sur la commande. Remise à NULL si la note change.';

-- L'onglet « Taillées » ne lit que les pièces visibles.
drop index public.line_alterations_done_at_idx;
create index line_alterations_done_at_idx
  on public.line_alterations (done_at) where status = 'taillee' and hidden_at is null;

-- --- 2. list_alterations : sans les pièces retirées --------------------------------
-- Par id (page de l'étiquette QR), la pièce est toujours trouvée.
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
  done_by_me boolean,
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
    coalesce(a.done_by = (select auth.uid()), false),
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
    -- Taillée retirée de la liste par le magasin. Une pièce « à faire » reste
    -- toujours visible, même si elle a été retirée puis remise à faire.
    and (p_id is not null or a.status = 'a_faire' or a.hidden_at is null)
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
  'Retouches lisibles par l''équipe ET le tailleur : client, pièce, taille, retouche, dates. Jamais d''argent. done_by_me : marquée par l''appelant. Les pièces retirées (hidden_at) ne sortent que par leur id.';

-- --- 3. sync_line_alterations : une note changée fait réapparaître la pièce --------
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
        -- Retouche CHANGÉE : à refaire, l'étiquette est à réimprimer, et la
        -- pièce revient dans les listes.
        status     = case when v_old_note = v_note then a.status     else 'a_faire' end,
        done_at    = case when v_old_note = v_note then a.done_at    else null end,
        done_by    = case when v_old_note = v_note then a.done_by    else null end,
        printed_at = case when v_old_note = v_note then a.printed_at else null end,
        hidden_at  = case when v_old_note = v_note then a.hidden_at  else null end
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
