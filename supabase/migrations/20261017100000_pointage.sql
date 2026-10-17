-- =============================================================================
-- Pointage de travail.
--
-- Chaque membre de l'équipe pointe son arrivée et son départ depuis son
-- téléphone. Une ligne = une période de travail : plusieurs par jour sont
-- permises (matin, pause, après-midi).
--
--   * L'HEURE VIENT DU SERVEUR. Un employé n'a aucun droit d'écriture sur la
--     table : il ne pointe qu'à travers `clock_in()` / `clock_out()`, qui
--     écrivent `now()`. Il ne peut ni antidater ni allonger une période.
--   * Deux périodes d'une même personne ne se chevauchent jamais, et une
--     période ouverte (sans départ) court jusqu'à l'infini : la même
--     contrainte EXCLUDE interdit donc aussi un double pointage d'arrivée.
--     Elle vaut pour les corrections du propriétaire.
--   * Le propriétaire voit tout et corrige tout (oubli de pointage, erreur).
--     `corrected_by` / `corrected_at` gardent la trace d'une correction.
-- =============================================================================

create table public.work_shifts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  clock_in timestamptz not null default now(),
  clock_out timestamptz,
  -- Le jour de la boutique, pas celui d'UTC : une arrivée à 00:30 à Alger
  -- compte pour ce jour-là.
  work_date date generated always as ((clock_in at time zone 'Africa/Algiers')::date) stored,
  note text,
  corrected_by uuid references public.profiles (id) on delete set null,
  corrected_at timestamptz,
  created_at timestamptz not null default now(),
  constraint work_shifts_order check (clock_out is null or clock_out > clock_in),
  constraint work_shifts_note_length check (note is null or char_length(note) <= 200),
  constraint work_shifts_no_overlap exclude using gist (
    user_id with =,
    tstzrange(clock_in, coalesce(clock_out, 'infinity'::timestamptz)) with &&
  )
);

comment on table public.work_shifts is
  'Pointage : une période de travail par ligne. Écriture employé via clock_in()/clock_out() seulement.';

create index work_shifts_date_user_idx on public.work_shifts (work_date, user_id);
create index work_shifts_open_idx on public.work_shifts (user_id) where clock_out is null;
create index work_shifts_corrected_by_idx on public.work_shifts (corrected_by)
  where corrected_by is not null;

-- --- RLS ---------------------------------------------------------------------
alter table public.work_shifts enable row level security;

create policy work_shifts_select on public.work_shifts
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_owner()));

create policy work_shifts_owner_insert on public.work_shifts
  for insert to authenticated with check ((select private.is_owner()));
create policy work_shifts_owner_update on public.work_shifts
  for update to authenticated
  using ((select private.is_owner())) with check ((select private.is_owner()));
create policy work_shifts_owner_delete on public.work_shifts
  for delete to authenticated using ((select private.is_owner()));

-- --- Pointer -----------------------------------------------------------------
-- SECURITY DEFINER : elles écrivent là où l'employé n'a pas de policy, mais
-- uniquement SA ligne et uniquement à l'heure du serveur.

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
  -- Déjà en service : la contrainte EXCLUDE lève 23P01.
  insert into public.work_shifts (user_id, clock_in)
  values ((select auth.uid()), now())
  returning clock_in into v_at;
  return v_at;
end;
$$;

create or replace function public.clock_out()
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
  update public.work_shifts
     set clock_out = now()
   where user_id = (select auth.uid())
     and clock_out is null
  returning clock_out into v_at;
  if v_at is null then
    raise exception 'not_clocked_in' using errcode = 'P0002';
  end if;
  return v_at;
end;
$$;

revoke execute on function public.clock_in() from public, anon;
revoke execute on function public.clock_out() from public, anon;
grant execute on function public.clock_in() to authenticated;
grant execute on function public.clock_out() to authenticated;

comment on function public.clock_in() is
  'Pointe l''arrivée de l''utilisateur connecté à l''heure du serveur. 23P01 si déjà en service.';
comment on function public.clock_out() is
  'Pointe le départ de l''utilisateur connecté. P0002 s''il n''est pas en service.';
