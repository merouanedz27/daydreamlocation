-- =============================================================================
-- Encaisser un versement sur une commande — « il rend le costume et paie le
-- reste »
--
-- CE QUI MANQUAIT
--
-- `amount_paid` (le « VERS » du tableur) ne s'écrivait qu'à la CRÉATION de la
-- commande. Le geste le plus courant du métier — le client revient, rend les
-- pièces et solde son reste — n'avait aucun chemin dans l'application. Le
-- « REST » affiché restait donc éternellement celui du jour de la réservation,
-- et les impayés du tableau de bord comptaient de l'argent déjà encaissé.
--
-- POURQUOI UNE FONCTION SQL ET PAS UN SIMPLE `update`
--
-- PostgREST ne sait pas écrire `amount_paid = amount_paid + 2000` : il faudrait
-- LIRE le montant, l'additionner en JavaScript, puis le RÉÉCRIRE. Deux
-- téléphones qui encaissent en même temps sur la même commande perdraient
-- alors un des deux versements, sans la moindre erreur — le pire mode de panne
-- pour de l'argent. L'incrément se fait donc dans la base, en une instruction.
--
-- ON ENCAISSE UN MONTANT, ON NE SAISIT PAS UN TOTAL
--
-- L'employé tape ce que le client lui tend (2 000), pas le cumul des
-- versements (5 500). C'est son geste réel, et c'est aussi ce qui rend
-- l'opération sûre en concurrence.
--
-- Un montant NÉGATIF est accepté : c'est le seul moyen de rattraper une faute
-- de frappe sur un champ d'argent (50 000 au lieu de 5 000). Sans lui, la
-- commande resterait fausse pour toujours. Il n'y a pas de table de versements
-- en v1 : `amount_paid` est un cumul, la correction en est donc un mouvement
-- comme un autre.
-- =============================================================================

create or replace function public.add_order_payment(
  p_order_id bigint,
  p_amount   numeric
)
returns numeric
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status  text;
  v_paid    numeric;
  v_balance numeric;
begin
  if p_amount is null or p_amount = 0 then
    raise exception 'payment_zero' using errcode = '22023';
  end if;

  -- Lecture PRÉALABLE dans le seul but de rendre un message utilisable :
  -- « commande annulée » se corrige, « violation de contrainte 23514 » non.
  -- Elle ne garantit rien par elle-même (la ligne peut changer entre les deux
  -- instructions) — la garantie vient de l'UPDATE atomique ci-dessous et de la
  -- contrainte `orders_amounts_positive`.
  select o.status, o.amount_paid into v_status, v_paid
  from public.orders o
  where o.id = p_order_id;

  if not found then
    raise exception 'payment_order_not_found' using errcode = 'P0002';
  end if;

  -- Une commande annulée n'encaisse plus rien : elle est sortie du chiffre
  -- d'affaires. La remettre en service d'abord, puis encaisser.
  if v_status = 'annulee' then
    raise exception 'payment_on_cancelled' using errcode = '22023';
  end if;

  if v_paid + p_amount < 0 then
    raise exception 'payment_too_large' using errcode = '22023';
  end if;

  -- L'incrément, lui, est atomique : deux encaissements simultanés
  -- s'additionnent au lieu de s'écraser.
  update public.orders
     set amount_paid = amount_paid + p_amount
   where id = p_order_id
  returning balance into v_balance;

  return v_balance;
end;
$$;

comment on function public.add_order_payment is
  'Ajoute un versement (montant POSITIF) ou corrige une saisie (montant '
  'NÉGATIF) sur une commande, et rend le nouveau reste dû. L''incrément est '
  'fait en base : deux téléphones qui encaissent en même temps ne peuvent pas '
  's''écraser.';

revoke all on function public.add_order_payment(bigint, numeric) from public, anon;
-- `staff` encaisse : c'est le métier quotidien du comptoir. La RLS
-- (`orders_update`) reste la seule autorité — `security invoker` l'applique.
grant execute on function public.add_order_payment(bigint, numeric) to authenticated;
