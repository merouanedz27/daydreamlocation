-- =============================================================================
-- Pointage, quatrième version du client : un PRIX PAR JOUR, et les REMPLAÇANTS.
--
-- 1. Le propriétaire ne saisit plus un salaire mensuel : il fixe le prix d'une
--    journée de chaque employé (`profiles.daily_rate`, prérempli à la paie).
--
-- 2. Deux façons d'être payé (`profiles.pay_type`) — ce n'est PAS un rôle :
--    un remplaçant reste employé ou modérateur pour ses droits dans l'app.
--
--      permanent   jours payés = jours du calendrier de la période − absences
--                  (on coche les ABSENCES, comme avant) ;
--      remplacant  jours payés = jours de présence cochés
--                  (il ne vient que pour remplacer : on coche les PRÉSENCES).
--
--    montant = jours payés × prix d'une journée, arrondi au dinar.
--
-- Le réglage « mois de paie = N jours » disparaît, avec `private.days_due`.
-- Les paies passées gardent leur `monthly_salary` / `month_days`.
-- =============================================================================

-- --- Profil : type de paie et prix d'une journée -----------------------------
alter table public.profiles
  add column pay_type text not null default 'permanent',
  add column daily_rate numeric(12, 2),
  add constraint profiles_pay_type_valid check (pay_type in ('permanent', 'remplacant')),
  add constraint profiles_daily_rate_valid check (daily_rate is null or daily_rate between 0 and 10000000);

comment on column public.profiles.pay_type is
  'Paie : permanent (calendrier − absences) ou remplacant (présences cochées). N''est pas un droit d''accès.';
comment on column public.profiles.daily_rate is
  'Prix d''une journée de travail, fixé par l''administrateur. Repris à chaque paie.';

-- --- Présences (remplaçants) -------------------------------------------------
create table public.presences (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  marked_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint presences_one_per_day unique (user_id, day)
);

comment on table public.presences is
  'Pointage des remplaçants : un jour travaillé par ligne. Écriture employé via mark_present()/unmark_present() seulement.';

create index presences_marked_by_idx on public.presences (marked_by) where marked_by is not null;

alter table public.presences enable row level security;

create policy presences_select on public.presences
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_owner()));
create policy presences_owner_insert on public.presences
  for insert to authenticated with check ((select private.is_owner()));
create policy presences_owner_delete on public.presences
  for delete to authenticated using ((select private.is_owner()));

-- Un jour payé ne se modifie plus, même par le propriétaire.
create or replace function private.presence_not_paid()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.presences := case when tg_op = 'DELETE' then old else new end;
begin
  if v_row.day <= coalesce(private.paid_through(v_row.user_id), '-infinity'::date) then
    raise exception 'day_locked' using errcode = 'P0001';
  end if;
  return v_row;
end;
$$;

revoke execute on function private.presence_not_paid() from public, anon, authenticated;

create trigger presences_not_paid
  before insert or delete on public.presences
  for each row execute function private.presence_not_paid();

-- --- Type de paie de l'utilisateur connecté ----------------------------------
create or replace function private.my_pay_type()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select pay_type from public.profiles where id = (select auth.uid());
$$;

revoke execute on function private.my_pay_type() from public, anon, authenticated;

-- --- Cocher : la bonne case pour le bon type ---------------------------------
-- Mêmes bornes qu'avant ; P0004 si l'employé n'est pas du type attendu.
create or replace function public.mark_absent(p_day date)
returns date
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Africa/Algiers')::date;
  v_user uuid := (select auth.uid());
begin
  if not (select private.is_staff()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if private.my_pay_type() is distinct from 'permanent' then
    raise exception 'wrong_pay_type' using errcode = 'P0004';
  end if;
  if p_day is null or p_day > v_today then
    raise exception 'day_out_of_period' using errcode = 'P0003';
  end if;
  if p_day <= coalesce(private.paid_through(v_user), '-infinity'::date) then
    raise exception 'already_paid' using errcode = 'P0001';
  end if;
  if p_day < private.period_start(v_user, v_today) then
    raise exception 'day_out_of_period' using errcode = 'P0003';
  end if;
  insert into public.absences (user_id, day, marked_by)
  values (v_user, p_day, v_user)
  on conflict (user_id, day) do nothing;
  return p_day;
end;
$$;

create or replace function public.mark_present(p_day date)
returns date
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Africa/Algiers')::date;
  v_user uuid := (select auth.uid());
begin
  if not (select private.is_staff()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if private.my_pay_type() is distinct from 'remplacant' then
    raise exception 'wrong_pay_type' using errcode = 'P0004';
  end if;
  if p_day is null or p_day > v_today then
    raise exception 'day_out_of_period' using errcode = 'P0003';
  end if;
  if p_day <= coalesce(private.paid_through(v_user), '-infinity'::date) then
    raise exception 'already_paid' using errcode = 'P0001';
  end if;
  if p_day < private.period_start(v_user, v_today) then
    raise exception 'day_out_of_period' using errcode = 'P0003';
  end if;
  insert into public.presences (user_id, day, marked_by)
  values (v_user, p_day, v_user)
  on conflict (user_id, day) do nothing;
  return p_day;
end;
$$;

-- Décocher une présence non payée (mauvais toucher). Comme pour les
-- absences, c'est au propriétaire de vérifier avant de payer.
create or replace function public.unmark_present(p_day date)
returns date
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_staff()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_day is null then
    raise exception 'day_out_of_period' using errcode = 'P0003';
  end if;
  if p_day <= coalesce(private.paid_through((select auth.uid())), '-infinity'::date) then
    raise exception 'already_paid' using errcode = 'P0001';
  end if;
  delete from public.presences where user_id = (select auth.uid()) and day = p_day;
  return p_day;
end;
$$;

revoke execute on function public.mark_present(date) from public, anon;
revoke execute on function public.unmark_present(date) from public, anon;
grant execute on function public.mark_present(date) to authenticated;
grant execute on function public.unmark_present(date) to authenticated;

comment on function public.mark_absent(date) is
  'Permanent : coche une absence dans sa période ouverte. P0001 payé, P0003 futur ou hors période, P0004 remplaçant.';
comment on function public.mark_present(date) is
  'Remplaçant : coche un jour de présence dans sa période ouverte. P0001 payé, P0003 futur ou hors période, P0004 permanent.';
comment on function public.unmark_present(date) is
  'Retire une présence non payée de l''utilisateur connecté. P0001 si ce jour est déjà payé.';

-- --- Paie ---------------------------------------------------------------------
alter table public.pay_resets
  add column pay_type text,
  add column presences_count integer,
  add constraint pay_resets_pay_type_valid check (pay_type is null or pay_type in ('permanent', 'remplacant')),
  add constraint pay_resets_presences_valid check (presences_count is null or presences_count >= 0);

comment on column public.pay_resets.days_count is
  'Jours payés : calendrier − absences (permanent) ou présences (remplaçant).';
comment on column public.pay_resets.daily_rate is 'Prix d''une journée au moment de la paie.';

drop function if exists public.pay_worker(uuid, numeric, text);

create function public.pay_worker(
  p_user uuid,
  p_daily_rate numeric,
  p_description text
)
returns table (days integer, absences integer, amount numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Africa/Algiers')::date;
  v_type text;
  v_from date;
  v_absences integer := 0;
  v_presences integer;
  v_days integer;
  v_amount numeric(12, 2);
  v_expense bigint;
begin
  if not (select private.is_owner()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_daily_rate is null or p_daily_rate <= 0 or p_daily_rate > 10000000 then
    raise exception 'rate_invalid' using errcode = '22023';
  end if;

  -- Deux paies simultanées de la même personne : la seconde attend.
  perform pg_advisory_xact_lock(hashtext('pay_worker:' || p_user::text));

  select pay_type into v_type from public.profiles where id = p_user;
  if v_type is null then
    raise exception 'unknown_worker' using errcode = 'P0002';
  end if;
  v_from := private.period_start(p_user, v_today);

  if v_type = 'remplacant' then
    select count(*) into v_presences
      from public.presences p
     where p.user_id = p_user and p.day >= v_from and p.day <= v_today;
    v_days := v_presences;
  else
    select count(*) into v_absences
      from public.absences a
     where a.user_id = p_user and a.day >= v_from and a.day <= v_today;
    v_days := greatest(greatest(v_today - v_from + 1, 0) - v_absences, 0);
  end if;
  v_amount := round(v_days * p_daily_rate, 0);

  -- Rien à payer : pas de dépense à 0 DA dans les frais.
  if v_amount > 0 then
    insert into public.expenses (spent_on, category, amount, description, created_by)
    values (v_today, 'salaire', v_amount, left(nullif(trim(p_description), ''), 300), (select auth.uid()))
    returning id into v_expense;
  end if;

  insert into public.pay_resets (
    user_id, paid_through, days_count, daily_rate, amount, expense_id, paid_by,
    pay_type, absences_count, presences_count
  )
  values (
    p_user, v_today, v_days, p_daily_rate, v_amount, v_expense, (select auth.uid()),
    v_type, case when v_type = 'permanent' then v_absences end, v_presences
  );

  -- La paie suivante repart de ce prix.
  update public.profiles set daily_rate = p_daily_rate where id = p_user;

  return query select v_days, v_absences, v_amount;
end;
$$;

revoke execute on function public.pay_worker(uuid, numeric, text) from public, anon;
grant execute on function public.pay_worker(uuid, numeric, text) to authenticated;

comment on function public.pay_worker(uuid, numeric, text) is
  'Propriétaire : paie un employé jusqu''à aujourd''hui (jours payés × prix d''une journée), ajoute la dépense salaire et remet le compteur à zéro.';

-- --- Fin du « mois de paie » --------------------------------------------------
drop function if exists private.days_due(date, date, integer);
alter table public.settings drop column if exists pay_month_days;
