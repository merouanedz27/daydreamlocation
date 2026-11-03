-- =============================================================================
-- Numéros de commande CONTINUS : CMD-00001, CMD-00002… sans trou.
--
-- Demande du client : ses commandes portaient CMD-00260 … CMD-01001 pour 271
-- commandes. Une séquence Postgres n'est PAS transactionnelle : une création
-- refusée (contrainte EXCLUDE, pièce déjà louée), un import rejoué ou un test
-- annulé (`db:test`) consomme quand même un numéro.
--
-- D'où un COMPTEUR dans une table : `next_order_no()` l'incrémente dans la
-- transaction de la commande. Si elle échoue, le numéro est rendu. Le verrou de
-- ligne range deux créations simultanées l'une après l'autre, ce qui est sans
-- effet à ce volume.
--
-- Les commandes existantes sont renumérotées dans l'ordre de CRÉATION (puis
-- d'id) ; les annulées gardent leur place. Les notifications de la cloche,
-- qui recopient le numéro, sont mises à jour. Les e-mails et les messages
-- WhatsApp déjà envoyés gardent l'ancien numéro.
-- =============================================================================

-- --- Le compteur ---------------------------------------------------------------
create table private.order_counter (
  id boolean primary key default true,
  last_no integer not null,
  constraint order_counter_single_row check (id),
  constraint order_counter_positive check (last_no >= 0)
);

alter table private.order_counter enable row level security;

comment on table private.order_counter is
  'Dernier numéro de commande attribué. Une seule ligne, lue et écrite par private.next_order_no().';

create or replace function private.next_order_no()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  update private.order_counter
     set last_no = last_no + 1
   returning 'CMD-' || lpad(last_no::text, 5, '0');
$$;

revoke execute on function private.next_order_no() from public, anon, authenticated;

-- Toute création passe par là : saisie rapide, vente, rejeu hors ligne,
-- import. Un numéro fourni par l'appelant est ignoré.
create or replace function private.orders_set_order_no()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.order_no := private.next_order_no();
  return new;
end;
$$;

revoke execute on function private.orders_set_order_no() from public, anon, authenticated;

-- --- Renumérotation ------------------------------------------------------------
-- En deux temps : `order_no` est unique (contrainte non différable), un
-- numéro final pourrait croiser un ancien encore en place.
update public.orders set order_no = 'TMP-' || id;

update public.orders o
   set order_no = 'CMD-' || lpad(r.n::text, 5, '0')
  from (select id, row_number() over (order by created_at, id) as n from public.orders) r
 where o.id = r.id;

insert into private.order_counter (last_no)
select count(*) from public.orders;

update public.notifications n
   set payload = jsonb_set(n.payload, '{orderNo}', to_jsonb(o.order_no))
  from public.orders o
 where n.order_id = o.id
   and n.payload ? 'orderNo';

-- --- La séquence s'en va -----------------------------------------------------
-- Une valeur par défaut reste, que le trigger écrase toujours : sans elle, les
-- types générés exigeraient un `order_no` à chaque insertion.
alter table public.orders alter column order_no set default 'CMD-00000';
drop sequence public.order_no_seq;

create trigger orders_set_order_no
  before insert on public.orders
  for each row execute function private.orders_set_order_no();

comment on column public.orders.order_no is
  'CMD-00001… Attribué par le trigger orders_set_order_no (compteur sans trou), jamais saisi.';
