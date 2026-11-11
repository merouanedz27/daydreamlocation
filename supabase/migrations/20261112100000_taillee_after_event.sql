-- Une pièce TAILLÉE sort de l'onglet « Taillées » le lendemain de l'événement.
--
-- Demande du client : événement le 8 novembre → le 9, le pantalon n'est plus
-- dans la liste, le client l'a emporté. Ce n'est pas une suppression : la
-- retouche reste sur la commande (fiche, bon, historique) et son étiquette QR
-- continue de répondre (lecture par id). Une pièce « à faire » reste visible
-- même après l'événement : c'est une anomalie que le magasin doit voir.
--
-- « Aujourd'hui » se lit à l'heure d'Alger, comme le reste du schéma.
--
-- Compatible avec le code de `v1.0.0-stable` : même signature.

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
    -- Taillée dont l'événement est passé : le client a emporté la pièce.
    and (p_id is not null or a.status = 'a_faire'
         or o.event_date >= (now() at time zone 'Africa/Algiers')::date)
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
  'Retouches lisibles par l''équipe ET le tailleur : client, pièce, taille, retouche, dates. Jamais d''argent. done_by_me : marquée par l''appelant. Les pièces retirées (hidden_at) et les taillées dont l''événement est passé (heure d''Alger) ne sortent que par leur id.';
