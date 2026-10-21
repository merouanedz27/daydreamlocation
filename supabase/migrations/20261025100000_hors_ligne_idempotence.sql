-- =============================================================================
-- Hors ligne, phase 2 : un geste mis en attente ne compte JAMAIS deux fois.
--
-- Hors ligne, le téléphone garde les gestes dans une file et les envoie au
-- retour du réseau. Une requête peut arriver au serveur, s'enregistrer, puis
-- perdre sa réponse en route : le téléphone la renvoie. Pour un booléen
-- (✈ aller validé, ✓ retour validé) ou une case de pointage, ce renvoi est
-- sans effet. Pour un ENCAISSEMENT ou un FRAIS, il compterait deux fois.
--
-- Chaque geste de la file porte donc un identifiant tiré sur le téléphone
-- (`client_op_id`, un UUID). La base refuse le même identifiant deux fois :
-- le renvoi devient un « déjà fait ».
-- =============================================================================

-- --- Frais --------------------------------------------------------------------
alter table public.expenses add column client_op_id uuid;

create unique index expenses_client_op_id_key
  on public.expenses (client_op_id) where client_op_id is not null;

comment on column public.expenses.client_op_id is
  'Identifiant du geste tiré sur le téléphone (file hors ligne) : un renvoi ne crée pas de doublon.';

-- --- Encaissements -------------------------------------------------------------
alter table public.order_payments add column client_op_id uuid;

create unique index order_payments_client_op_id_key
  on public.order_payments (client_op_id) where client_op_id is not null;

comment on column public.order_payments.client_op_id is
  'Identifiant du geste tiré sur le téléphone : add_order_payment() ne l''applique qu''une fois.';

-- Le trigger du journal recopie l'identifiant passé par add_order_payment().
-- S'il existe déjà, l'index unique fait échouer TOUTE la transaction : le
-- montant versé n'est pas augmenté une seconde fois.
create or replace function private.log_order_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delta numeric;
  v_op text := nullif(current_setting('daydream.payment_op', true), '');
begin
  if tg_op = 'INSERT' then
    v_delta := new.amount_paid;
  else
    v_delta := new.amount_paid - old.amount_paid;
  end if;

  if v_delta is null or v_delta = 0 then
    return null;
  end if;

  insert into public.order_payments (order_id, amount, kind, client_op_id)
  values (
    new.id,
    v_delta,
    case when tg_op = 'UPDATE'
          and current_setting('daydream.payment_kind', true) = 'reste'
         then 'reste' else 'versement' end,
    case when tg_op = 'UPDATE' then v_op::uuid end
  );
  return null;
end;
$$;

revoke all on function private.log_order_payment() from public, anon, authenticated;

-- Déjà appliqué ? Lecture du journal hors RLS (l'employé n'y a pas accès).
create or replace function private.payment_op_done(p_op uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.order_payments where client_op_id = p_op);
$$;

revoke execute on function private.payment_op_done(uuid) from public, anon;
grant execute on function private.payment_op_done(uuid) to authenticated;

drop function if exists public.add_order_payment(bigint, numeric);

create function public.add_order_payment(
  p_order_id     bigint,
  p_amount       numeric,
  p_client_op_id uuid default null
)
returns numeric
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status  text;
  v_paid    numeric;
  v_balance numeric;
begin
  if p_amount is null or p_amount = 0 then
    raise exception 'payment_zero' using errcode = '22023';
  end if;

  select o.status, o.amount_paid, o.balance into v_status, v_paid, v_balance
  from public.orders o
  where o.id = p_order_id;

  if not found then
    raise exception 'payment_order_not_found' using errcode = 'P0002';
  end if;

  -- Renvoi d'un geste déjà enregistré : on rend le reste dû, sans rien ajouter.
  -- Deux renvois simultanés passent tous deux ce test ; le second échoue alors
  -- sur l'index unique du journal (23505), que l'action traite en « déjà fait ».
  if p_client_op_id is not null and private.payment_op_done(p_client_op_id) then
    return v_balance;
  end if;

  if v_status = 'annulee' then
    raise exception 'payment_on_cancelled' using errcode = '22023';
  end if;

  if v_paid + p_amount < 0 then
    raise exception 'payment_too_large' using errcode = '22023';
  end if;

  perform set_config('daydream.payment_kind', 'reste', true);
  perform set_config('daydream.payment_op', coalesce(p_client_op_id::text, ''), true);

  update public.orders
     set amount_paid = amount_paid + p_amount
   where id = p_order_id
  returning balance into v_balance;

  return v_balance;
end;
$$;

comment on function public.add_order_payment(bigint, numeric, uuid) is
  'Ajoute un versement (POSITIF) ou corrige une saisie (NÉGATIF) et rend le nouveau reste dû. '
  'Avec p_client_op_id, un renvoi du même geste (file hors ligne) n''ajoute rien.';

revoke all on function public.add_order_payment(bigint, numeric, uuid) from public, anon;
grant execute on function public.add_order_payment(bigint, numeric, uuid) to authenticated;
