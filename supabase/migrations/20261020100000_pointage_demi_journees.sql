-- =============================================================================
-- Pointage : DEUX cases par jour — matin et après-midi.
--
-- D'habitude l'employé ne fait qu'un des deux services ; s'il fait les deux,
-- le jour compte DOUBLE à la paie. Une case cochée = une ligne `attendance`
-- (user_id, day, shift) : `pay_worker()`, qui compte des lignes, compte donc
-- déjà les services sans changement.
--
-- Les cases déjà cochées deviennent des services du MATIN (valeur par défaut).
--
-- L'employé coche aussi un jour OUBLIÉ de sa période (`mark_day`), dans ces
-- bornes, vérifiées par le serveur :
--   * jamais dans le futur (date d'Alger) ;
--   * jamais un jour payé (le trigger `attendance_not_paid` le refuse aussi) ;
--   * jamais avant la période ouverte : le lendemain de la dernière paie, ou,
--     pour qui n'a jamais été payé, le 1er du mois en cours.
-- Décocher reste réservé au jour même (`unmark_today`) : un service passé
-- coché ne s'efface que par le propriétaire.
-- =============================================================================

alter table public.attendance
  add column shift text not null default 'matin',
  add constraint attendance_shift_valid check (shift in ('matin', 'apres_midi'));

alter table public.attendance drop constraint attendance_one_per_day;
alter table public.attendance
  add constraint attendance_one_per_shift unique (user_id, day, shift);

comment on table public.attendance is
  'Pointage : un service coché par ligne (matin / après-midi). Écriture employé via mark_day()/unmark_today() seulement.';
comment on column public.attendance.shift is
  'matin | apres_midi. Chaque service coché compte un jour à la paie.';

-- --- Fonctions : le service devient un paramètre -----------------------------
drop function if exists public.mark_today();
drop function if exists public.mark_day(date);
drop function if exists public.unmark_today();

create or replace function public.mark_day(p_day date, p_shift text)
returns date
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Africa/Algiers')::date;
  v_paid date;
begin
  if not (select private.is_staff()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_shift is null or p_shift not in ('matin', 'apres_midi') then
    raise exception 'shift_invalid' using errcode = '22023';
  end if;
  v_paid := private.paid_through((select auth.uid()));
  if p_day is null or p_day > v_today then
    raise exception 'day_out_of_period' using errcode = 'P0003';
  end if;
  if p_day <= coalesce(v_paid, '-infinity'::date) then
    raise exception 'already_paid' using errcode = 'P0001';
  end if;
  if v_paid is null and p_day < date_trunc('month', v_today)::date then
    raise exception 'day_out_of_period' using errcode = 'P0003';
  end if;
  insert into public.attendance (user_id, day, shift, marked_by)
  values ((select auth.uid()), p_day, p_shift, (select auth.uid()))
  on conflict (user_id, day, shift) do nothing;
  return p_day;
end;
$$;

create or replace function public.unmark_today(p_shift text)
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
  delete from public.attendance
   where user_id = (select auth.uid()) and day = v_today and shift = p_shift;
  return v_today;
end;
$$;

revoke execute on function public.mark_day(date, text) from public, anon;
revoke execute on function public.unmark_today(text) from public, anon;
grant execute on function public.mark_day(date, text) to authenticated;
grant execute on function public.unmark_today(text) to authenticated;

comment on function public.mark_day(date, text) is
  'Coche un service (matin / apres_midi) d''un jour de la période ouverte. P0001 si payé, P0003 si futur ou hors période.';
comment on function public.unmark_today(text) is
  'Décoche un service du jour de l''utilisateur connecté. P0001 si ce jour est déjà payé.';
