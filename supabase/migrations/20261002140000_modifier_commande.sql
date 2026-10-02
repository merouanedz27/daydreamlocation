-- =============================================================================
-- Modifier une commande — avec le MÊME formulaire que la saisie
--
-- Jusqu'ici une commande ne se corrigeait qu'à la marge (cases aller/retour,
-- versement, annulation). Une faute sur le nom, la date ou un vêtement
-- obligeait à annuler et ressaisir. Son AppSheet, lui, rouvre la ligne dans
-- le même formulaire : on fait pareil.
--
-- 1. `private.insert_order_lines` : l'insertion des lignes, sortie de
--    `create_order` pour servir aux deux fonctions. Une seule copie de la
--    règle « une pièce du stock déjà prise lève unit_unavailable:<ref> ».
--
-- 2. `create_order` : inchangée pour l'appelant, elle passe par l'aide.
--
-- 3. `update_order` : réécrit la commande et REMPLACE toutes ses lignes, en
--    une transaction. L'ordre des opérations compte :
--      a. verrouiller la commande ;
--      b. SUPPRIMER les anciennes lignes — avant de toucher aux dates : sinon
--         le changement de dates se propagerait à des pièces qu'on retire, et
--         pourrait échouer sur un conflit qui n'a plus lieu d'être ;
--      c. mettre à jour la commande (les triggers en déduisent le statut) ;
--      d. réinsérer les lignes : la contrainte `EXCLUDE` revérifie CHAQUE
--         pièce du stock sur les nouvelles dates.
--    Au moindre conflit, rien n'est écrit : la commande reste telle qu'elle
--    était.
--
-- Tout en `security invoker` : la RLS de `orders` / `order_lines` décide.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Insertion des lignes d'une commande
-- -----------------------------------------------------------------------------
create or replace function private.insert_order_lines(p_order_id bigint, p_lines jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_line jsonb;
  v_unit_id bigint;
  v_ref text;
  v_model_name text;
  v_size text;
  v_label text;
begin
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_unit_id := nullif(btrim(coalesce(v_line->>'unitId', '')), '')::bigint;

    if v_unit_id is not null then
      -- Pièce du STOCK. Instantanés relus EN BASE, jamais recopiés depuis le
      -- client : ils fixent l'historique et ne doivent pas être falsifiables.
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
          order_id, unit_id, unit_price, line_note, model_name_snapshot, size_snapshot
        ) values (
          p_order_id,
          v_unit_id,
          coalesce(nullif(btrim(coalesce(v_line->>'unitPrice', '')), '')::numeric, 0),
          nullif(btrim(coalesce(v_line->>'note', '')), ''),
          v_model_name,
          v_size
        );
      exception when exclusion_violation then
        -- La contrainte anti-double-réservation vient de parler. Cette
        -- exception fait avorter TOUTE la fonction appelante : rien n'est écrit.
        raise exception 'unit_unavailable:%', v_ref using errcode = '23P01';
      end;

    elsif v_line->>'kind' = 'named' then
      -- Vêtement NOMMÉ, hors stock : aucun `unit_id`, donc aucune date bloquée.
      v_label := nullif(btrim(coalesce(v_line->>'name', '')), '');
      if v_label is null then
        raise exception 'named_label_required' using errcode = '22023';
      end if;

      insert into public.order_lines (
        order_id, unit_id, unit_price, line_note, model_name_snapshot, size_snapshot
      ) values (
        p_order_id,
        null,
        coalesce(nullif(btrim(coalesce(v_line->>'unitPrice', '')), '')::numeric, 0),
        nullif(btrim(coalesce(v_line->>'note', '')), ''),
        v_label,
        nullif(btrim(coalesce(v_line->>'size', '')), '')
      );

    else
      -- Pièce sous-louée chez un confrère : pas de `unit_id`, aucune date
      -- bloquée — nous ne gérons pas le planning d'un autre magasin.
      v_label := nullif(btrim(coalesce(v_line->>'label', '')), '');
      if v_label is null then
        raise exception 'external_label_required' using errcode = '22023';
      end if;

      insert into public.order_lines (
        order_id, unit_id, external_source, external_label, external_cost,
        unit_price, line_note, model_name_snapshot
      ) values (
        p_order_id,
        null,
        nullif(btrim(coalesce(v_line->>'source', '')), ''),
        v_label,
        nullif(btrim(coalesce(v_line->>'cost', '')), '')::numeric,
        coalesce(nullif(btrim(coalesce(v_line->>'unitPrice', '')), '')::numeric, 0),
        nullif(btrim(coalesce(v_line->>'note', '')), ''),
        v_label
      );
    end if;
  end loop;
end;
$$;

comment on function private.insert_order_lines is
'Insère les lignes d''une commande (pièce du stock, vêtement nommé ou pièce externe). Lève 23P01 « unit_unavailable:<ref> » si une pièce est déjà prise. Partagée par create_order et update_order.';

revoke all on function private.insert_order_lines(bigint, jsonb) from public, anon;
grant execute on function private.insert_order_lines(bigint, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. create_order — même signature, lignes déléguées à l'aide
-- -----------------------------------------------------------------------------
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
  v_order_id bigint;
begin
  if p_customer_name is null or btrim(p_customer_name) = '' then
    raise exception 'customer_name_required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'lines_required' using errcode = '22023';
  end if;

  -- `pickup_date` / `return_due_date` peuvent rester NULL : le trigger
  -- `orders_default_window` les déduit de la date de l'événement (J-1 / J+1).
  insert into public.orders (
    customer_name, customer_phone, event_date, pickup_date, return_due_date,
    discount, amount_paid, caution_amount, notes, created_by
  ) values (
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

  perform private.insert_order_lines(v_order_id, p_lines);
  return v_order_id;
end;
$$;

comment on function public.create_order is
'Crée une commande et toutes ses lignes en UNE transaction. Si une pièce est déjà réservée sur ces dates, lève 23P01 « unit_unavailable:<ref> » et rien n''est écrit. `p_lines` : tableau d''objets {unitId, unitPrice, note} (pièce du stock), {kind:"named", name, size, unitPrice, note} (vêtement nommé hors stock) ou {source, label, cost, unitPrice, note} (pièce externe).';

-- -----------------------------------------------------------------------------
-- 3. update_order — la commande réécrite, ses lignes remplacées
-- -----------------------------------------------------------------------------
create or replace function public.update_order(
  p_order_id bigint,
  p_customer_name text,
  p_customer_phone text,
  p_event_date date,
  p_pickup_date date,
  p_return_due_date date,
  p_amount_paid numeric default 0,
  p_caution_amount numeric default 0,
  p_notes text default null,
  p_picked_up boolean default false,
  p_returned boolean default false,
  p_lines jsonb default '[]'::jsonb
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status text;
begin
  if p_customer_name is null or btrim(p_customer_name) = '' then
    raise exception 'customer_name_required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'lines_required' using errcode = '22023';
  end if;

  -- a. Verrou : deux téléphones qui modifient la même commande en même temps
  --    passent l'un après l'autre, jamais entremêlés.
  select status into v_status from public.orders where id = p_order_id for update;
  if not found then
    -- Inexistante, OU invisible pour l'appelant (RLS) : même réponse.
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  -- Une commande annulée a rendu ses pièces : la modifier les rebloquerait en
  -- silence. On la rétablit d'abord, depuis la fiche.
  if v_status = 'annulee' then
    raise exception 'order_cancelled' using errcode = '22023';
  end if;

  -- b. Les anciennes lignes partent AVANT le changement de dates.
  delete from public.order_lines where order_id = p_order_id;

  -- c. La commande. `discount` repart à 0 : le formulaire saisit un PRIX DE
  --    TENUE, porté par les lignes — une remise restante le fausserait.
  --    Le statut n'est jamais écrit ici : `orders_before_update` le déduit des
  --    deux cases.
  update public.orders set
    customer_name = btrim(p_customer_name),
    customer_phone = nullif(btrim(coalesce(p_customer_phone, '')), ''),
    event_date = p_event_date,
    pickup_date = coalesce(p_pickup_date, pickup_date),
    return_due_date = coalesce(p_return_due_date, return_due_date),
    discount = 0,
    amount_paid = coalesce(p_amount_paid, 0),
    caution_amount = coalesce(p_caution_amount, 0),
    notes = nullif(btrim(coalesce(p_notes, '')), ''),
    -- Une tenue ne revient pas sans être partie.
    picked_up = coalesce(p_picked_up, false) or coalesce(p_returned, false),
    returned = coalesce(p_returned, false)
  where id = p_order_id;

  -- d. Les nouvelles lignes, revérifiées une à une par la contrainte EXCLUDE.
  perform private.insert_order_lines(p_order_id, p_lines);
  return p_order_id;
end;
$$;

comment on function public.update_order is
'Modifie une commande et REMPLACE toutes ses lignes en UNE transaction (même format de `p_lines` que create_order). Pièce déjà prise : 23P01 « unit_unavailable:<ref> », et rien n''est modifié. Commande annulée : order_cancelled.';

revoke all on function public.update_order(
  bigint, text, text, date, date, date, numeric, numeric, text, boolean, boolean, jsonb
) from public, anon;
grant execute on function public.update_order(
  bigint, text, text, date, date, date, numeric, numeric, text, boolean, boolean, jsonb
) to authenticated;
