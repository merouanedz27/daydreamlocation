"use server";

import { getProfile } from "@/lib/auth";
import { parseOrdersQuery, type OrderTableRow, type OrdersParams } from "@/lib/orders-query";
import { getOrdersTable } from "@/lib/queries/orders-list";

/**
 * La tranche SUIVANTE du tableau des commandes, quand la liste arrive en bas.
 *
 * Les filtres sont relus depuis les paramètres d'URL bruts, par la même
 * fonction que la page : la suite d'une liste filtrée reste filtrée de la même
 * façon, et un paramètre trafiqué retombe sur la valeur par défaut.
 */
export async function loadMoreOrders(
  params: OrdersParams,
  offset: number,
): Promise<OrderTableRow[]> {
  const profile = await getProfile();
  if (!profile) return [];
  if (!Number.isInteger(offset) || offset < 0) return [];

  const { rows } = await getOrdersTable(parseOrdersQuery(params), offset);
  return rows;
}
