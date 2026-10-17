-- =============================================================================
-- Pointage : UNE arrivée et UN départ par personne et par jour.
--
-- Le propriétaire veut seulement savoir si chacun a pointé, et à quelle heure :
-- on arrive à la boutique, on pointe ; on finit sa journée, on pointe. Pas de
-- pause, pas de seconde période. La base le garantit : un index unique sur
-- (user_id, work_date), pour le pointage comme pour les corrections.
--
-- La contrainte EXCLUDE de chevauchement reste : elle empêche toujours une
-- période laissée ouverte la veille de courir sur celle du jour.
-- =============================================================================

-- --- 1. Fusionner les jours qui ont déjà plusieurs périodes -------------------
-- On garde la PREMIÈRE ligne du jour : arrivée la plus tôt, départ le plus
-- tard — ou aucun départ si l'une des périodes est encore ouverte.
-- Deux instructions, dans cet ordre : la contrainte EXCLUDE se vérifie ligne à
-- ligne, la période élargie chevaucherait les autres si elles existaient encore.
create temp table pointage_days on commit drop as
select
  user_id,
  work_date,
  min(id) as keep_id,
  min(clock_in) as first_in,
  case when bool_or(clock_out is null) then null else max(clock_out) end as last_out
from public.work_shifts
group by user_id, work_date
having count(*) > 1;

delete from public.work_shifts w
using pointage_days d
where w.user_id = d.user_id
  and w.work_date = d.work_date
  and w.id <> d.keep_id;

update public.work_shifts w
   set clock_in = d.first_in,
       clock_out = d.last_out
  from pointage_days d
 where w.id = d.keep_id;

-- --- 2. Une ligne par jour ----------------------------------------------------
create unique index work_shifts_one_per_day on public.work_shifts (user_id, work_date);

-- L'index unique couvre désormais les recherches par jour.
drop index if exists public.work_shifts_date_user_idx;
create index work_shifts_date_idx on public.work_shifts (work_date);

comment on table public.work_shifts is
  'Pointage : une ligne par personne et par jour (arrivée, départ). Écriture employé via clock_in()/clock_out() seulement.';

-- --- 3. Arrivée : refusée si la journée est déjà pointée ----------------------
create or replace function public.clock_in()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_at timestamptz;
begin
  if not (select private.is_staff()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- Déjà pointé aujourd'hui (arrivé, ou arrivé puis parti) : message clair
  -- plutôt que l'index unique. L'index reste le filet en cas de course.
  if exists (
    select 1 from public.work_shifts
    where user_id = (select auth.uid())
      and work_date = (now() at time zone 'Africa/Algiers')::date
  ) then
    raise exception 'day_done' using errcode = 'P0001';
  end if;
  -- Période de la veille restée ouverte : la contrainte EXCLUDE lève 23P01.
  insert into public.work_shifts (user_id, clock_in)
  values ((select auth.uid()), now())
  returning clock_in into v_at;
  return v_at;
end;
$$;

revoke execute on function public.clock_in() from public, anon;
grant execute on function public.clock_in() to authenticated;

comment on function public.clock_in() is
  'Pointe l''arrivée du jour à l''heure du serveur. P0001 si la journée est déjà pointée, 23P01 si une période est encore ouverte.';
