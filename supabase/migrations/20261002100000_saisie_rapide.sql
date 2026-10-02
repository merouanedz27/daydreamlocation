-- =============================================================================
-- Saisie rapide — la commande se tape comme une ligne du tableur
--
-- Le client compare l'application à son AppSheet : une commande, c'est UNE
-- ligne — nom, date, costume, chemise, chaussures en texte libre, un prix pour
-- la tenue. Or `create_order` n'acceptait que des pièces du STOCK (encore
-- presque vide) ou des pièces sous-louées. La saisie était donc impossible pour
-- l'essentiel de son activité réelle.
--
-- 1. `create_order` accepte un troisième type de ligne, « named » : un
--    vêtement NOMMÉ sans être rattaché au stock — exactement ce que la reprise
--    du tableur écrit déjà (`order_lines_designates_something` l'autorise).
--    Pas de `unit_id`, donc aucune date bloquée : on ne peut pas garantir la
--    disponibilité d'un vêtement que le stock ne connaît pas. La contrainte
--    `EXCLUDE` reste intacte pour les pièces du stock.
--
-- 2. Deux fonctions de SUGGESTION pour l'écran : les libellés de vêtements
--    déjà utilisés, et les clients déjà venus. C'est ce qui rend la saisie plus
--    rapide que le tableur : on tape « chem », on touche la ligne.
--
-- Toutes en `security invoker` : la RLS de `orders` / `order_lines` décide,
-- ces fonctions n'accordent rien.
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
  ) returns bigint language plpgsql security invoker
set search_path = '' as $$
declare v_order_id bigint;
v_line jsonb;
v_unit_id bigint;
v_ref text;
v_model_name text;
v_size text;
v_label text;
begin if p_customer_name is null
or btrim(p_customer_name) = '' then raise exception 'customer_name_required' using errcode = '22023';
end if;
if jsonb_typeof(p_lines) is distinct
from 'array'
  or jsonb_array_length(p_lines) = 0 then raise exception 'lines_required' using errcode = '22023';
end if;
-- `pickup_date` / `return_due_date` peuvent rester NULL : le trigger
-- `orders_default_window` les déduit de la date de l'événement (J-1 / J+1).
insert into public.orders (
    customer_name,
    customer_phone,
    event_date,
    pickup_date,
    return_due_date,
    discount,
    amount_paid,
    caution_amount,
    notes,
    created_by
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
    (
      select auth.uid()
    )
  )
returning id into v_order_id;
for v_line in
select value
from jsonb_array_elements(p_lines) loop v_unit_id := nullif(btrim(coalesce(v_line->>'unitId', '')), '')::bigint;
if v_unit_id is not null then -- Instantanés relus EN BASE, jamais recopiés depuis le client : ils
-- fixent l'historique de la commande et ne doivent pas être falsifiables.
select u.ref_code,
  m.name_fr,
  u.size into v_ref,
  v_model_name,
  v_size
from public.article_units u
  join public.article_models m on m.id = u.model_id
where u.id = v_unit_id;
if not found then raise exception 'unit_not_found:%',
v_unit_id using errcode = '23503';
end if;
begin
insert into public.order_lines (
    order_id,
    unit_id,
    unit_price,
    line_note,
    model_name_snapshot,
    size_snapshot
  )
values (
    v_order_id,
    v_unit_id,
    coalesce(
      nullif(btrim(coalesce(v_line->>'unitPrice', '')), '')::numeric,
      0
    ),
    nullif(btrim(coalesce(v_line->>'note', '')), ''),
    v_model_name,
    v_size
  );
exception
when exclusion_violation then -- C'est LA contrainte anti-double-réservation qui vient de parler.
-- Cette nouvelle exception fait avorter toute la fonction : ni
-- commande, ni lignes déjà insérées ne subsistent.
raise exception 'unit_unavailable:%',
v_ref using errcode = '23P01';
end;
elsif v_line->>'kind' = 'named' then -- Vêtement NOMMÉ, hors stock : « Invite Noir Simple », taille 50. Comme
-- les lignes reprises du tableur. Aucun `unit_id`, donc aucune date
-- bloquée — le stock ne connaît pas ce vêtement.
v_label := nullif(btrim(coalesce(v_line->>'name', '')), '');
if v_label is null then raise exception 'named_label_required' using errcode = '22023';
end if;
insert into public.order_lines (
    order_id,
    unit_id,
    unit_price,
    line_note,
    model_name_snapshot,
    size_snapshot
  )
values (
    v_order_id,
    null,
    coalesce(
      nullif(btrim(coalesce(v_line->>'unitPrice', '')), '')::numeric,
      0
    ),
    nullif(btrim(coalesce(v_line->>'note', '')), ''),
    v_label,
    nullif(btrim(coalesce(v_line->>'size', '')), '')
  );
else -- Pièce sous-louée chez un confrère (colonne « FETHI LOC » du tableur).
-- Pas de `unit_id`, donc aucune date bloquée : nous ne gérons pas le
-- planning d'un autre magasin.
v_label := nullif(btrim(coalesce(v_line->>'label', '')), '');
if v_label is null then raise exception 'external_label_required' using errcode = '22023';
end if;
insert into public.order_lines (
    order_id,
    unit_id,
    external_source,
    external_label,
    external_cost,
    unit_price,
    line_note,
    model_name_snapshot
  )
values (
    v_order_id,
    null,
    nullif(btrim(coalesce(v_line->>'source', '')), ''),
    v_label,
    nullif(btrim(coalesce(v_line->>'cost', '')), '')::numeric,
    coalesce(
      nullif(btrim(coalesce(v_line->>'unitPrice', '')), '')::numeric,
      0
    ),
    nullif(btrim(coalesce(v_line->>'note', '')), ''),
    v_label
  );
end if;
end loop;
return v_order_id;
end;
$$;
comment on function public.create_order is 'Crée une commande et toutes ses lignes en UNE transaction. Si une pièce est déjà réservée sur ces dates, lève 23P01 « unit_unavailable:<ref> » et rien n''est écrit. `p_lines` : tableau d''objets {unitId, unitPrice, note} (pièce du stock), {kind:"named", name, size, unitPrice, note} (vêtement nommé hors stock) ou {source, label, cost, unitPrice, note} (pièce externe).';
-- -----------------------------------------------------------------------------
-- 2. Suggestions de vêtements : les libellés déjà tapés, les plus utilisés
-- d'abord.
--
-- `slot` est la position HABITUELLE du libellé dans sa commande (1 = tenue,
-- 2 = chemise, 3 = chaussures — l'ordre des colonnes du tableur, que l'écran
-- de saisie rapide reproduit). Ce n'est qu'un indice de TRI : l'écran montre
-- d'abord les chemises dans la case chemise, mais trouve tout en tapant.
-- -----------------------------------------------------------------------------
create or replace function public.order_item_suggestions() returns table (label text, uses bigint, slot integer) language sql stable security invoker
set search_path = '' as $$ with positioned as (
    select btrim(l.model_name_snapshot) as label,
      row_number() over (
        partition by l.order_id
        order by l.id
      ) as pos
    from public.order_lines l
    where l.unit_id is null
      and l.external_label is null
      and l.model_name_snapshot is not null
      and btrim(l.model_name_snapshot) <> ''
  )
select min(label) as label,
  count(*) as uses,
  least(
    mode() within group (
      order by pos
    ),
    4
  )::integer as slot
from positioned
group by lower(label)
order by count(*) desc,
  min(label)
limit 500;
$$;
comment on function public.order_item_suggestions is 'Libellés de vêtements hors stock déjà saisis, pour l''autocomplétion de la saisie rapide. `slot` : position habituelle dans la commande (indice de tri).';
-- -----------------------------------------------------------------------------
-- 3. Suggestions de clients : un nom tapé une fois ne se retape plus, et son
-- numéro vient avec. Le numéro retenu est celui de la commande la plus récente.
-- -----------------------------------------------------------------------------
create or replace function public.customer_suggestions() returns table (name text, phone text, orders bigint) language sql stable security invoker
set search_path = '' as $$
select (
    array_agg(
      btrim(o.customer_name)
      order by o.created_at desc
    )
  ) [1] as name,
  (
    array_agg(
      o.customer_phone
      order by o.created_at desc
    ) filter (
      where o.customer_phone is not null
    )
  ) [1] as phone,
  count(*) as orders
from public.orders o
where btrim(o.customer_name) <> ''
group by lower(btrim(o.customer_name)),
  coalesce(o.customer_phone, '')
order by max(o.created_at) desc
limit 800;
$$;
comment on function public.customer_suggestions is 'Clients déjà venus (nom + dernier téléphone), pour l''autocomplétion de la saisie rapide.';
revoke all on function public.order_item_suggestions()
from public,
  anon;
revoke all on function public.customer_suggestions()
from public,
  anon;
grant execute on function public.order_item_suggestions() to authenticated;
grant execute on function public.customer_suggestions() to authenticated;