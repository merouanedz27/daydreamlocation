-- =============================================================================
-- Frais saisis par l'équipe
--
-- Dans son AppSheet, l'onglet « Frais » est rempli par les employés eux-mêmes :
-- le tailleur payé, le pressing, la livraison — au moment où l'argent sort de
-- la caisse. Jusqu'ici `expenses` était réservée au propriétaire, et ces frais
-- ne pouvaient donc être notés que par lui, le soir, de mémoire.
--
-- La frontière reste la même pour ce qui compte : l'équipe n'AJOUTE que ses
-- propres frais et ne relit que les siens (pour corriger une faute de frappe à
-- l'œil). Les totaux, les charges des autres, les salaires et le bénéfice
-- restent au propriétaire seul (`expenses_owner_all`, inchangée).
--
-- Pas de modification ni de suppression pour l'équipe : une dépense effacée
-- fausse le bénéfice du mois. Une erreur se signale au propriétaire.
-- =============================================================================

create policy expenses_staff_insert on public.expenses
  for insert to authenticated
  with check (
    (select private.is_staff())
    -- Toujours au nom de celui qui saisit : impossible d'attribuer un frais à
    -- un collègue.
    and created_by = (select auth.uid())
  );

create policy expenses_staff_select_own on public.expenses
  for select to authenticated
  using (
    (select private.is_staff())
    and created_by = (select auth.uid())
  );

-- `expenses_created_by_idx` existe déjà (schéma initial) : la condition
-- `created_by = auth.uid()` de la policy de lecture s'appuie dessus.
