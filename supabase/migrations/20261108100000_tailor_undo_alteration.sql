-- Le tailleur peut ANNULER un scan fait par erreur, comme le magasin.
--
-- Il n'a aucune policy sur `line_alterations` : il passe, comme pour
-- mark_altered(), par une fonction SECURITY DEFINER. Il ne défait que SES
-- propres scans ; l'équipe du magasin défait n'importe lequel.
--
-- `list_alterations` rend en plus `done_by_me`, pour que l'atelier n'affiche
-- « Annuler » que sur les pièces que le tailleur a lui-même marquées.

-- --- 1. list_alterations + done_by_me ---------------------------------------------
drop function public.list_alterations(text, uuid, timestamptz);

create function public.list_alterations(
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
  'Retouches lisibles par l''équipe ET le tailleur : client, pièce, taille, retouche, dates. Jamais d''argent. done_by_me : marquée par l''appelant.';

-- --- 2. Annuler un scan ----------------------------------------------------------
-- Idempotente : une pièce déjà « à faire » ne change pas. Rend l'id de la
-- commande, pour rafraîchir sa fiche.
create function public.undo_altered(p_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_done_by uuid;
  v_line bigint;
  v_order bigint;
begin
  if not (select private.is_tailor_or_staff()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select a.status, a.done_by, a.order_line_id, a.order_id
    into v_status, v_done_by, v_line, v_order
  from public.line_alterations a
  where a.id = p_id
  for update;

  if not found or v_line is null then
    raise exception 'alteration_not_found' using errcode = 'P0002';
  end if;

  -- Le tailleur ne défait que ce qu'il a lui-même marqué.
  if not (select private.is_staff())
     and v_done_by is distinct from (select auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_status = 'taillee' then
    update public.line_alterations
    set status = 'a_faire', done_at = null, done_by = null
    where id = p_id;
  end if;

  return v_order;
end;
$$;

revoke all on function public.undo_altered(uuid) from public, anon;
grant execute on function public.undo_altered(uuid) to authenticated;

comment on function public.undo_altered is
  'Remet une retouche « à faire » (scan par erreur). Le tailleur : ses propres scans seulement ; l''équipe : tous.';
