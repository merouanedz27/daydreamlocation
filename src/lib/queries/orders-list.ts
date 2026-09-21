import { createClient } from "@/lib/supabase/server";
import {
  SORTABLE,
  ordersFilters,
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
       return_due_date, status, total_price, amount_paid, balance,
       caution_amount`,
      { count: "exact" },
    );

  // Mêmes filtres que l'export Excel : voir `ordersFilters`.
  const { search, status } = ordersFilters(query);
  if (search) request = request.or(search);
  if (status) request = request.eq("status", status);

  const from = (query.page - 1) * query.perPage;

  const { data, count } = await request
    .order(SORTABLE[query.sort], { ascending: query.ascending })
    // Départage stable : deux commandes du même jour ne doivent pas changer
    // d'ordre entre deux pages, sinon une ligne peut être vue deux fois ou
    // jamais.
    .order("id", { ascending: false })
    .range(from, from + query.perPage - 1);

  return { rows: (data ?? []) as OrderRow[], total: count ?? 0 };
}
