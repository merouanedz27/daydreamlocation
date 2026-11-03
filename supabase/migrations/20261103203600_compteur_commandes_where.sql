-- =============================================================================
-- Compteur des numéros de commande : l'UPDATE prend un WHERE.
--
-- Supabase charge `pg-safeupdate` pour toutes les requêtes de l'API (PostgREST) :
-- un UPDATE sans WHERE y est refusé (« 21000 UPDATE requires a WHERE clause »),
-- même dans une fonction `security definer`. La version de
-- 20261103180007_commandes_numerotation_continue.sql bloquait donc TOUTE
-- création de commande depuis l'application. Les tests SQL, eux, passent par
-- une connexion directe, sans cette extension : ils ne l'ont pas vu.
--
-- La table n'a qu'une ligne (id = true) : `where id` la vise, et elle seule.
-- =============================================================================

create or replace function private.next_order_no()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  update private.order_counter
     set last_no = last_no + 1
   where id
   returning 'CMD-' || lpad(last_no::text, 5, '0');
$$;

revoke execute on function private.next_order_no() from public, anon, authenticated;
