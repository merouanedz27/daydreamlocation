import { createClient } from "@/lib/supabase/server";
import {
  PAGE_SIZE,
  SORTABLE,
  sanitizeSearch,
  type OrderRow,
  type OrdersQuery,
} from "@/lib/orders-query";

/**
 * Requête de la liste des commandes : recherche, filtre, tri et pagination.
 *
 * Tout se fait CÔTÉ SERVEUR et ensemble. Filtrer ou trier 25 lignes déjà
 * paginées dans le navigateur donnerait des résultats faux — on ne verrait que
 * ce que la page courante contient déjà.
 *
 * Les constantes et la normalisation des paramètres vivent dans
 * `src/lib/orders-query.ts`, sans dépendance serveur, pour rester importables
 * depuis un composant client.
 */
export async function getOrdersPage(query: OrdersQuery): Promise<{
  rows: OrderRow[];
  total: number;
}> {
  const supabase = await createClient();

  let request = supabase
    .from("orders")
    .select(
      `id, order_no, customer_name, customer_phone, event_date, pickup_date,
       status, total_price, amount_paid, balance, caution_amount`,
      { count: "exact" },
    );

  const term = sanitizeSearch(query.q);
  if (term) {
    // On cherche sur ce que l'équipe a sous les yeux quand le client appelle :
    // son nom, le numéro de commande, son téléphone.
    request = request.or(
      `customer_name.ilike.%${term}%,order_no.ilike.%${term}%,customer_phone.ilike.%${term}%`,
    );
  }

  if (query.status) request = request.eq("status", query.status);

  const from = (query.page - 1) * PAGE_SIZE;

  const { data, count } = await request
    .order(SORTABLE[query.sort], { ascending: query.ascending })
    // Départage stable : deux commandes du même jour ne doivent pas changer
    // d'ordre entre deux pages, sinon une ligne peut être vue deux fois ou
    // jamais.
    .order("id", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  return { rows: (data ?? []) as OrderRow[], total: count ?? 0 };
}
