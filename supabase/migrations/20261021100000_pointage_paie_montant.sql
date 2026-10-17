-- =============================================================================
-- Pointage : la paie porte un MONTANT, et ce montant entre dans les frais.
--
-- Au moment de payer, le propriétaire saisit le prix d'une journée ; le total
-- = jours cochés × prix. `pay_worker()` fait tout dans UNE transaction :
--   1. compte les cases depuis la dernière paie ;
--   2. enregistre la dépense « salaire » (`expenses`) — le bénéfice du tableau
--      de bord en tient compte, comme de tout autre frais ;
--   3. remet le compteur à zéro (`pay_resets`), avec le prix, le total et le
--      lien vers la dépense.
-- Aucune case ne peut se glisser entre le compte et la dépense.
--
-- Le prix de la dernière paie sert à préremplir la suivante.
-- =============================================================================

alter table public.pay_resets
  add column daily_rate numeric(12, 2),
  add column amount numeric(12, 2),
  add column expense_id bigint references public.expenses (id) on delete set null,
  add constraint pay_resets_amounts_valid check (
    (daily_rate is null or daily_rate >= 0) and (amount is null or amount >= 0)
  );

create index pay_resets_expense_idx on public.pay_resets (expense_id) where expense_id is not null;

comment on column public.pay_resets.daily_rate is 'Prix d''une journée (un service coché) au moment de la paie.';
comment on column public.pay_resets.amount is 'Total payé = days_count × daily_rate. Repris dans expenses (salaire).';

drop function if exists public.pay_worker(uuid);

create or replace function public.pay_worker(
  p_user uuid,
  p_daily_rate numeric,
  p_description text
)
returns table (days integer, amount numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Africa/Algiers')::date;
  v_from date;
  v_count integer;
  v_amount numeric(12, 2);
  v_expense bigint;
begin
  if not (select private.is_owner()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_daily_rate is null or p_daily_rate < 0 or p_daily_rate > 10000000 then
    raise exception 'rate_invalid' using errcode = '22023';
  end if;

  -- Deux paies simultanées de la même personne : la seconde attend.
  perform pg_advisory_xact_lock(hashtext('pay_worker:' || p_user::text));
  v_from := coalesce(private.paid_through(p_user), '-infinity'::date);
  select count(*) into v_count
    from public.attendance
   where user_id = p_user and day > v_from and day <= v_today;
  v_amount := round(v_count * p_daily_rate, 2);

  -- Rien à payer : pas de dépense à 0 DA dans les frais.
  if v_amount > 0 then
    insert into public.expenses (spent_on, category, amount, description, created_by)
    values (v_today, 'salaire', v_amount, left(nullif(trim(p_description), ''), 300), (select auth.uid()))
    returning id into v_expense;
  end if;

  insert into public.pay_resets (user_id, paid_through, days_count, daily_rate, amount, expense_id, paid_by)
  values (p_user, v_today, v_count, p_daily_rate, v_amount, v_expense, (select auth.uid()));

  return query select v_count, v_amount;
end;
$$;

revoke execute on function public.pay_worker(uuid, numeric, text) from public, anon;
grant execute on function public.pay_worker(uuid, numeric, text) to authenticated;

comment on function public.pay_worker(uuid, numeric, text) is
  'Propriétaire : paie un employé jusqu''à aujourd''hui (jours × prix), ajoute la dépense salaire et remet le compteur à zéro.';
