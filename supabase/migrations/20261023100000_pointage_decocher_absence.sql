-- =============================================================================
-- Pointage : l'employé décoche une absence passée (mauvais toucher).
--
-- Jusqu'ici seule l'absence du jour se retirait (`unmark_absent_today`). Le
-- verrou n'avait rien d'une protection : qui veut tricher ne coche simplement
-- pas son absence, et c'est au propriétaire de vérifier. Il ne faisait que
-- bloquer l'employé qui s'était trompé de ligne.
--
-- Désormais toute absence NON PAYÉE de l'employé se retire. Un jour payé
-- reste fermé (P0001, aussi tenu par le trigger `absences_not_paid`).
-- =============================================================================

drop function if exists public.unmark_absent_today();

create or replace function public.unmark_absent(p_day date)
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
  delete from public.absences where user_id = (select auth.uid()) and day = p_day;
  return p_day;
end;
$$;

revoke execute on function public.unmark_absent(date) from public, anon;
grant execute on function public.unmark_absent(date) to authenticated;

comment on function public.unmark_absent(date) is
  'Retire une absence non payée de l''utilisateur connecté. P0001 si ce jour est déjà payé.';

comment on table public.absences is
  'Pointage : un jour d''absence par ligne. Écriture employé via mark_absent()/unmark_absent() seulement.';
