-- =============================================================================
-- Chacun change SON nom affiché (écran « Mot de passe »).
--
-- `profiles_update_owner` ne laisse modifier un profil qu'à l'administrateur :
-- un membre ne pouvait donc pas corriger son propre nom. Plutôt qu'une policy
-- UPDATE « sur soi » — qui ouvrirait TOUTE la ligne, `role` et `is_active`
-- compris — une fonction qui ne touche qu'à `full_name`, et seulement sur la
-- ligne de l'appelant.
-- =============================================================================

create or replace function public.set_own_full_name(p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'invalid name' using errcode = '22023';
  end if;

  update public.profiles
     set full_name = v_name
   where id = auth.uid()
     and is_active;
end;
$$;

comment on function public.set_own_full_name is
  'Change le nom affiché de l''utilisateur connecté, et rien d''autre.';

revoke all on function public.set_own_full_name(text) from public, anon;
grant execute on function public.set_own_full_name(text) to authenticated;
