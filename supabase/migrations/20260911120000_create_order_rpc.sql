-- =============================================================================
-- create_order — création ATOMIQUE d'une commande et de ses lignes
--
-- POURQUOI UNE FONCTION ET PAS DEUX APPELS
--
-- Créer une commande, c'est 1 insertion dans `orders` puis N dans
-- `order_lines`. Deux appels PostgREST successifs ne sont PAS dans la même
-- transaction : si la 3ᵉ pièce se révèle déjà louée, la commande et ses deux
-- premières lignes resteraient en base — et ces deux pièces seraient bloquées
-- au profit d'une commande qui n'existe pas vraiment. L'employé, lui, verrait
-- une erreur et recommencerait, doublant la commande.
--
-- Tout se joue donc dans une seule fonction, donc une seule transaction :
-- la moindre pièce indisponible annule l'ensemble.
--
-- `security invoker` : la RLS de `orders` et `order_lines` s'applique telle
-- quelle. Cette fonction n'accorde aucun droit supplémentaire, elle ne fait que
-- garantir l'atomicité. C'est `private.is_staff()` qui autorise, comme partout.
-- =============================================================================

create or replace function public.create_order(
  p_customer_name text,
  p_customer_phone text,
  p_event_date date,
  p_pickup_date date default null,
  p_return_due_date date default null,
  p_discount numeric default 0,
  p_amount_paid numeric default 0,
  p_caution_amount numeric default 0,
  p_notes text default null,
  p_lines jsonb default '[]'::jsonb
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order_id   bigint;
  v_line       jsonb;
  v_unit_id    bigint;
  v_ref        text;
  v_model_name text;
  v_size       text;
  v_label      text;
begin
  if p_customer_name is null or btrim(p_customer_name) = '' then
    raise exception 'customer_name_required' using errcode = '22023';
  end if;

  if jsonb_typeof(p_lines) is distinct from 'array'
     or jsonb_array_length(p_lines) = 0 then
    raise exception 'lines_required' using errcode = '22023';
  end if;

  -- `pickup_date` / `return_due_date` peuvent rester NULL : le trigger
  -- `orders_default_window` les déduit de la date de l'événement (J-1 / J+1).
  insert into public.orders (
    customer_name, customer_phone, event_date, pickup_date, return_due_date,
    discount, amount_paid, caution_amount, notes, created_by
  )
  values (
    btrim(p_customer_name),
    nullif(btrim(coalesce(p_customer_phone, '')), ''),
    p_event_date,
    p_pickup_date,
    p_return_due_date,
    coalesce(p_discount, 0),
    coalesce(p_amount_paid, 0),
    coalesce(p_caution_amount, 0),
    nullif(btrim(coalesce(p_notes, '')), ''),
    -- Jamais reçu du client : c'est la traçabilité de qui a saisi quoi.
    (select auth.uid())
  )
  returning id into v_order_id;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_unit_id := nullif(btrim(coalesce(v_line ->> 'unitId', '')), '')::bigint;

    if v_unit_id is not null then
      -- Instantanés relus EN BASE, jamais recopiés depuis le client : ils
      -- fixent l'historique de la commande et ne doivent pas être falsifiables.
      select u.ref_code, m.name_fr, u.size
        into v_ref, v_model_name, v_size
      from public.article_units u
      join public.article_models m on m.id = u.model_id
      where u.id = v_unit_id;

      if not found then
        raise exception 'unit_not_found:%', v_unit_id using errcode = '23503';
      end if;

      begin
        insert into public.order_lines (
          order_id, unit_id, unit_price, line_note,
          model_name_snapshot, size_snapshot
        )
        values (
          v_order_id,
          v_unit_id,
          coalesce(nullif(btrim(coalesce(v_line ->> 'unitPrice', '')), '')::numeric, 0),
          nullif(btrim(coalesce(v_line ->> 'note', '')), ''),
          v_model_name,
          v_size
        );
      exception
        when exclusion_violation then
          -- C'est LA contrainte anti-double-réservation qui vient de parler.
          -- On la retraduit en nommant la pièce : « Gio-079-01 est déjà
          -- réservée » est actionnable, « 23P01 » ne l'est pas.
          -- Cette nouvelle exception fait avorter toute la fonction : ni
          -- commande, ni lignes déjà insérées ne subsistent.
          raise exception 'unit_unavailable:%', v_ref using errcode = '23P01';
      end;

    else
      -- Pièce sous-louée chez un confrère (colonne « FETHI LOC » du tableur).
      -- Pas de `unit_id`, donc aucune date bloquée : nous ne gérons pas le
      -- planning d'un autre magasin.
      v_label := nullif(btrim(coalesce(v_line ->> 'label', '')), '');

      if v_label is null then
        raise exception 'external_label_required' using errcode = '22023';
      end if;

      insert into public.order_lines (
        order_id, unit_id, external_source, external_label, external_cost,
        unit_price, line_note, model_name_snapshot
      )
      values (
        v_order_id,
        null,
        nullif(btrim(coalesce(v_line ->> 'source', '')), ''),
        v_label,
        nullif(btrim(coalesce(v_line ->> 'cost', '')), '')::numeric,
        coalesce(nullif(btrim(coalesce(v_line ->> 'unitPrice', '')), '')::numeric, 0),
        nullif(btrim(coalesce(v_line ->> 'note', '')), ''),
        v_label
      );
    end if;
  end loop;

  return v_order_id;
end;
$$;

comment on function public.create_order is
  'Crée une commande et toutes ses lignes en UNE transaction. Si une pièce est '
  'déjà réservée sur ces dates, lève 23P01 « unit_unavailable:<ref> » et rien '
  'n''est écrit. `p_lines` : tableau d''objets {unitId, unitPrice, note} ou '
  '{source, label, cost, unitPrice, note} pour une pièce externe.';

-- Le rôle anonyme n'a rien à faire ici : on ne crée pas de commande sans compte.
revoke all on function public.create_order(
  text, text, date, date, date, numeric, numeric, numeric, text, jsonb
) from public, anon;

grant execute on function public.create_order(
  text, text, date, date, date, numeric, numeric, numeric, text, jsonb
) to authenticated;
