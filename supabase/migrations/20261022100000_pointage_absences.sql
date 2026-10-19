-- =============================================================================
-- Pointage, troisième version du client : on coche les ABSENCES.
--
-- Cocher chaque jour de présence lassait l'équipe : elle vient presque tous
-- les jours. Désormais l'employé n'ouvre le pointage que le jour où il ne
-- vient pas, et coche « Absent ». À la paie :
--
--   jours dus     = mois par mois sur la période : un mois ENTIER compte
--                   N jours (`settings.pay_month_days`, 30 par défaut), qu'il
--                   en ait 28 ou 31 ; un mois partiel compte ses jours réels,
--                   au plus N.
--   jours payés   = jours dus − absences de la période (jamais négatif).
--   montant       = salaire mensuel × jours payés ÷ N.
--
-- La période commence au plus tard de : lendemain de la dernière paie, date
-- de début de travail (`profiles.work_start_date`). Sans l'une ni l'autre,
-- le 1er du mois en cours. La date de début sert aux employés déjà en poste
-- quand l'application arrive : on sait d'où partir.
--
-- Une absence couvre la journée entière : matin / après-midi disparaissent.
-- `attendance` (présences) ne contenait que quelques jours d'essai ; les
-- paies passées restent dans `pay_resets`.
-- =============================================================================

-- --- Réglage et date de début ------------------------------------------------
alter table public.settings
  add column pay_month_days smallint not null default 30,
  add constraint settings_pay_month_days_valid check (pay_month_days between 20 and 31);

comment on column public.settings.pay_month_days is
  'Jours d''un mois de paie complet (30 ou 28…). Salaire ÷ ce nombre = prix d''une journée.';

alter table public.profiles add column work_start_date date;

comment on column public.profiles.work_start_date is
  'Premier jour de travail : la paie ne compte rien avant. Saisi par l''administrateur.';

-- --- Fin des présences --------------------------------------------------------
drop function if exists public.mark_day(date, text);
drop function if exists public.unmark_today(text);
drop function if exists public.pay_worker(uuid, numeric, text);
drop table if exists public.attendance;
drop function if exists private.attendance_not_paid();

-- --- Absences -----------------------------------------------------------------
create table public.absences (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  marked_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint absences_one_per_day unique (user_id, day)
);

comment on table public.absences is
  'Pointage : un jour d''absence par ligne. Écriture employé via mark_absent()/unmark_absent_today() seulement.';

create index absences_marked_by_idx on public.absences (marked_by) where marked_by is not null;

alter table public.absences enable row level security;

create policy absences_select on public.absences
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_owner()));
create policy absences_owner_insert on public.absences
  for insert to authenticated with check ((select private.is_owner()));
create policy absences_owner_delete on public.absences
  for delete to authenticated using ((select private.is_owner()));

-- Un jour payé ne se modifie plus, même par le propriétaire.
create or replace function private.absence_not_paid()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.absences := case when tg_op = 'DELETE' then old else new end;
begin
  if v_row.day <= coalesce(private.paid_through(v_row.user_id), '-infinity'::date) then
    raise exception 'day_locked' using errcode = 'P0001';
  end if;
  return v_row;
end;
$$;

revoke execute on function private.absence_not_paid() from public, anon, authenticated;

create trigger absences_not_paid
  before insert or delete on public.absences
  for each row execute function private.absence_not_paid();

-- --- Calcul -------------------------------------------------------------------

-- Jours dus de p_from à p_to inclus : un mois entier vaut p_n, un mois
-- partiel ses jours réels (au plus p_n). 0 si p_from > p_to.
-- Miroir : `daysDue()` dans src/lib/pointage.ts.
create or replace function private.days_due(p_from date, p_to date, p_n integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select coalesce(sum(
    case
      when m.first_day >= p_from and m.last_day <= p_to then p_n
      else least(least(m.last_day, p_to) - greatest(m.first_day, p_from) + 1, p_n)
    end
  ), 0)::integer
  from generate_series(
         date_trunc('month', p_from::timestamp),
         date_trunc('month', p_to::timestamp),
         interval '1 month'
       ) as g(month_start)
  cross join lateral (
    select g.month_start::date as first_day,
           (g.month_start + interval '1 month')::date - 1 as last_day
  ) as m
  where p_from <= p_to;
$$;

revoke execute on function private.days_due(date, date, integer) from public, anon, authenticated;

-- Premier jour de la période ouverte (peut tomber après aujourd'hui : payé ce
-- soir, ou embauché la semaine prochaine — rien n'est alors dû).
create or replace function private.period_start(p_user uuid, p_today date)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    greatest(
      private.paid_through(p_user) + 1,
      (select work_start_date from public.profiles where id = p_user)
    ),
    date_trunc('month', p_today::timestamp)::date
  );
$$;

revoke execute on function private.period_start(uuid, date) from public, anon, authenticated;

-- --- L'employé coche / décoche --------------------------------------------------
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

-- Décocher : aujourd'hui seulement. Une absence passée ne s'efface que par le
-- propriétaire — sinon l'employé gonflerait sa propre paie.
create or replace function public.unmark_absent_today()
returns date
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Africa/Algiers')::date;
begin
  if not (select private.is_staff()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_today <= coalesce(private.paid_through((select auth.uid())), '-infinity'::date) then
    raise exception 'already_paid' using errcode = 'P0001';
  end if;
  delete from public.absences where user_id = (select auth.uid()) and day = v_today;
  return v_today;
end;
$$;

revoke execute on function public.mark_absent(date) from public, anon;
revoke execute on function public.unmark_absent_today() from public, anon;
grant execute on function public.mark_absent(date) to authenticated;
grant execute on function public.unmark_absent_today() to authenticated;

comment on function public.mark_absent(date) is
  'Coche une absence de l''utilisateur connecté dans sa période ouverte. P0001 si payé, P0003 si futur ou hors période.';
comment on function public.unmark_absent_today() is
  'Retire l''absence du jour de l''utilisateur connecté. P0001 si ce jour est déjà payé.';

-- --- Paie -----------------------------------------------------------------------
alter table public.pay_resets
  add column monthly_salary numeric(12, 2),
  add column month_days smallint,
  add column absences_count integer,
  add constraint pay_resets_salary_valid check (
    (monthly_salary is null or monthly_salary >= 0)
    and (month_days is null or month_days between 20 and 31)
    and (absences_count is null or absences_count >= 0)
  );

comment on column public.pay_resets.monthly_salary is 'Salaire mensuel saisi à la paie. Prix d''une journée = monthly_salary ÷ month_days.';
comment on column public.pay_resets.days_count is 'Jours payés : jours dus − absences.';

create or replace function public.pay_worker(
  p_user uuid,
  p_monthly_salary numeric,
  p_description text
)
returns table (days integer, absences integer, amount numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Africa/Algiers')::date;
  v_n integer;
  v_from date;
  v_absences integer;
  v_days integer;
  v_amount numeric(12, 2);
  v_expense bigint;
begin
  if not (select private.is_owner()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_monthly_salary is null or p_monthly_salary < 0 or p_monthly_salary > 100000000 then
    raise exception 'salary_invalid' using errcode = '22023';
  end if;

  -- Deux paies simultanées de la même personne : la seconde attend.
  perform pg_advisory_xact_lock(hashtext('pay_worker:' || p_user::text));

  select pay_month_days into v_n from public.settings where id;
  v_n := coalesce(v_n, 30);
  v_from := private.period_start(p_user, v_today);
  select count(*) into v_absences
    from public.absences a
   where a.user_id = p_user and a.day >= v_from and a.day <= v_today;
  v_days := greatest(private.days_due(v_from, v_today, v_n) - v_absences, 0);
  v_amount := round(p_monthly_salary * v_days / v_n, 0);

  -- Rien à payer : pas de dépense à 0 DA dans les frais.
  if v_amount > 0 then
    insert into public.expenses (spent_on, category, amount, description, created_by)
    values (v_today, 'salaire', v_amount, left(nullif(trim(p_description), ''), 300), (select auth.uid()))
    returning id into v_expense;
  end if;

  insert into public.pay_resets (
    user_id, paid_through, days_count, daily_rate, amount, expense_id, paid_by,
    monthly_salary, month_days, absences_count
  )
  values (
    p_user, v_today, v_days, round(p_monthly_salary / v_n, 2), v_amount, v_expense, (select auth.uid()),
    p_monthly_salary, v_n, v_absences
  );

  return query select v_days, v_absences, v_amount;
end;
$$;

revoke execute on function public.pay_worker(uuid, numeric, text) from public, anon;
grant execute on function public.pay_worker(uuid, numeric, text) to authenticated;

comment on function public.pay_worker(uuid, numeric, text) is
  'Propriétaire : paie un employé jusqu''à aujourd''hui (salaire ÷ N × (jours dus − absences)), ajoute la dépense salaire et remet le compteur à zéro.';
