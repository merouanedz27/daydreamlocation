-- =============================================================================
-- Pointage, version du client : une CASE par jour, remise à zéro à la paie.
--
-- Il ne veut ni heure d'arrivée ni heure de départ : l'employé coche la case
-- du jour en arrivant ; le propriétaire voit combien de jours chacun a cochés
-- depuis sa dernière paie, et quand il le paie, un bouton remet son compteur
-- à zéro.
--
--   * attendance  — un jour coché = une ligne (user_id, day), unique.
--   * pay_resets  — une paie = une ligne : payé jusqu'au `paid_through`
--                   inclus, `days_count` jours. RIEN n'est effacé : la période
--                   ouverte commence le lendemain de la dernière paie.
--
-- L'employé ne coche que AUJOURD'HUI, à la date du serveur, par
-- `mark_today()` / `unmark_today()` : il n'a aucun droit d'écriture direct.
-- Le propriétaire coche n'importe quel jour non payé (oubli) et paie par
-- `pay_worker()`, qui compte et remet à zéro dans la même transaction.
--
-- Remplace `work_shifts` (heures d'arrivée / de départ), qui ne contenait que
-- des pointages de test.
-- =============================================================================

drop function if exists public.clock_in();
drop function if exists public.clock_out();
drop table if exists public.work_shifts;

-- --- Tables ------------------------------------------------------------------
create table public.attendance (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  marked_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint attendance_one_per_day unique (user_id, day)
);

comment on table public.attendance is
  'Pointage : un jour coché par ligne. Écriture employé via mark_today()/unmark_today() seulement.';

create index attendance_marked_by_idx on public.attendance (marked_by) where marked_by is not null;

create table public.pay_resets (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  paid_through date not null,
  days_count integer not null check (days_count >= 0),
  paid_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.pay_resets is
  'Paie d''un employé : remet son compteur de jours à zéro. Écriture via pay_worker() seulement.';

create index pay_resets_user_idx on public.pay_resets (user_id, paid_through desc);
create index pay_resets_paid_by_idx on public.pay_resets (paid_by) where paid_by is not null;

-- --- RLS ---------------------------------------------------------------------
alter table public.attendance enable row level security;
alter table public.pay_resets enable row level security;

create policy attendance_select on public.attendance
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_owner()));
create policy attendance_owner_insert on public.attendance
  for insert to authenticated with check ((select private.is_owner()));
create policy attendance_owner_delete on public.attendance
  for delete to authenticated using ((select private.is_owner()));

create policy pay_resets_select on public.pay_resets
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_owner()));
-- Aucune policy d'écriture : une paie passe par pay_worker().

-- --- Fonctions ---------------------------------------------------------------

-- Dernier jour payé d'une personne, `null` si jamais payée.
create or replace function private.paid_through(p_user uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select max(paid_through) from public.pay_resets where user_id = p_user;
$$;

revoke execute on function private.paid_through(uuid) from public, anon, authenticated;

-- Un jour déjà payé ne se coche plus, même par le propriétaire : il serait
-- compté une seconde fois à la paie suivante… ou jamais, selon l'ordre.
create or replace function private.attendance_not_paid()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.day <= coalesce(private.paid_through(new.user_id), '-infinity'::date) then
    raise exception 'day_locked' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function private.attendance_not_paid() from public, anon, authenticated;

create trigger attendance_not_paid
  before insert on public.attendance
  for each row execute function private.attendance_not_paid();

create or replace function public.mark_today()
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
  -- Payé jusqu'à aujourd'hui inclus : la case du jour est fermée.
  if v_today <= coalesce(private.paid_through((select auth.uid())), '-infinity'::date) then
    raise exception 'already_paid' using errcode = 'P0001';
  end if;
  insert into public.attendance (user_id, day, marked_by)
  values ((select auth.uid()), v_today, (select auth.uid()))
  on conflict (user_id, day) do nothing;
  return v_today;
end;
$$;

create or replace function public.unmark_today()
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
  delete from public.attendance where user_id = (select auth.uid()) and day = v_today;
  return v_today;
end;
$$;

-- Compte les jours cochés depuis la dernière paie et remet à zéro — en une
-- transaction : aucune case ne peut se glisser entre le compte et la remise.
create or replace function public.pay_worker(p_user uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Africa/Algiers')::date;
  v_from date;
  v_count integer;
begin
  if not (select private.is_owner()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- Deux paies simultanées de la même personne : la seconde attend.
  perform pg_advisory_xact_lock(hashtext('pay_worker:' || p_user::text));
  v_from := coalesce(private.paid_through(p_user), '-infinity'::date);
  select count(*) into v_count
    from public.attendance
   where user_id = p_user and day > v_from and day <= v_today;
  insert into public.pay_resets (user_id, paid_through, days_count, paid_by)
  values (p_user, v_today, v_count, (select auth.uid()));
  return v_count;
end;
$$;

revoke execute on function public.mark_today() from public, anon;
revoke execute on function public.unmark_today() from public, anon;
revoke execute on function public.pay_worker(uuid) from public, anon;
grant execute on function public.mark_today() to authenticated;
grant execute on function public.unmark_today() to authenticated;
grant execute on function public.pay_worker(uuid) to authenticated;

comment on function public.mark_today() is
  'Coche la case du jour de l''utilisateur connecté (date d''Alger). P0001 si ce jour est déjà payé.';
comment on function public.unmark_today() is
  'Décoche la case du jour de l''utilisateur connecté. P0001 si ce jour est déjà payé.';
comment on function public.pay_worker(uuid) is
  'Propriétaire : enregistre la paie d''un employé jusqu''à aujourd''hui et rend le nombre de jours payés.';
