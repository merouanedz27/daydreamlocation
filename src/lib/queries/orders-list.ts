import { createClient } from "@/lib/supabase/server";
import type { IsoDate } from "@/lib/rental-range";
import {
  ORDERS_BATCH,
  SORTABLE,
  orderSearchFilter,
  ordersFilters,
  searchTerm,
  type OrderRow,
  type OrderTableRow,
  type OrdersQuery,
} from "@/lib/orders-query";
import { getLabelSlots } from "@/lib/queries/orders";
import { normalizeSearch } from "@/lib/search";
import { ticketFields, type TicketFields } from "@/lib/ticket-fields";

/** Colonnes d'une ligne de liste — partagées par tous les écrans de liste. */
const ROW_COLUMNS = `id, order_no, customer_name, customer_phone, event_date,
  pickup_date, return_due_date, status, picked_up, returned, total_price,
  amount_paid, balance, caution_amount`;

/** Au-delà, le terme est trop vague (« a ») pour servir : on s'en tient aux commandes les plus récentes. */
const MAX_PIECE_MATCHES = 300;

/**
 * Les commandes dont une PIÈCE porte le terme cherché — « Tuxedo B »,
 * « Bligha 44 », une référence du stock. Le nom vient de l'instantané posé sur
 * la ligne à la saisie (`model_name_snapshot`) ou du libellé d'une pièce
 * externe : c'est ce que montre la colonne « Pièces » du tableau.
 *
 * Une seconde requête plutôt qu'une jointure filtrée : PostgREST ne sait pas
 * mettre un filtre sur une table liée DANS le `.or(...)` de la commande. Les
 * identifiants trouvés rejoignent donc la recherche par nom et téléphone.
 */
export async function pieceOrderIds(q: string | null | undefined): Promise<number[]> {
  const term = searchTerm(q);
  if (!term) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("order_lines")
    .select("order_id")
    .eq("is_active", true)
    .or(`model_name_snapshot.ilike.%${term}%,external_label.ilike.%${term}%`)
    .order("order_id", { ascending: false })
    .limit(MAX_PIECE_MATCHES);
  return [...new Set((data ?? []).map((l) => l.order_id))];
}

/**
 * Une tranche du tableau des commandes : recherche, filtre, tri, puis
 * `offset` / `limit` — la liste se déroule, elle n'a plus de pages.
 *
 * Tout se fait CÔTÉ SERVEUR et ensemble. Filtrer ou trier des lignes déjà
 * chargées dans le navigateur donnerait des résultats faux — on ne verrait
 * que ce qui est déjà arrivé.
 *
 * Les pièces viennent avec chaque commande (jointure `order_lines`) et sont
 * remises dans les colonnes de son AppSheet — costume, taille, chemise,
 * chaussures, accessoires — par le même calcul que le bon de location
 * (`ticketFields`) : le tableau dit ce que dit le ticket.
 */
export async function getOrdersTable(
  query: OrdersQuery,
  offset = 0,
  limit = ORDERS_BATCH,
): Promise<{ rows: OrderTableRow[]; total: number }> {
  // Tout part EN MÊME TEMPS : les libellés habituels ne retardent pas la liste.
  const [supabase, pieceIds, labelSlots] = await Promise.all([
    createClient(),
    pieceOrderIds(query.q),
    getLabelSlots(),
  ]);

  let request = supabase
    .from("orders")
    .select(
      `${ROW_COLUMNS},
       order_lines ( id, unit_id, model_name_snapshot, size_snapshot, external_label,
         external_source, external_cost, line_note, is_active,
         article_units ( ref_code, part, article_models ( categories ( slug ) ) ) ),
       profiles ( full_name )`,
      { count: "exact" },
    );

  // Mêmes filtres que l'export Excel : voir `ordersFilters`.
  const { search, status, from, to } = ordersFilters(query, pieceIds);
  if (search) request = request.or(search);
  if (status) request = request.eq("status", status);
  if (from) request = request.gte("event_date", from);
  if (to) request = request.lte("event_date", to);

  const { data, count } = await request
    .order(SORTABLE[query.sort], { ascending: query.ascending })
    // Départage stable : deux commandes du même jour ne doivent pas changer
    // d'ordre entre deux tranches, sinon une ligne peut être vue deux fois ou
    // jamais.
    .order("id", { ascending: false })
    .order("id", { referencedTable: "order_lines", ascending: true })
    .range(offset, offset + limit - 1);

  type Raw = OrderRow & {
    profiles: { full_name: string } | null;
    order_lines: {
      id: number;
      unit_id: number | null;
      model_name_snapshot: string | null;
      size_snapshot: string | null;
      external_label: string | null;
      external_source: string | null;
      external_cost: number | null;
      line_note: string | null;
      is_active: boolean;
      article_units: {
        ref_code: string;
        part: string | null;
        article_models: { categories: { slug: string } | null } | null;
      } | null;
    }[];
  };

  const slotOf = (label: string) => labelSlots.get(normalizeSearch(label)) ?? null;

  const rows = ((data ?? []) as unknown as Raw[]).map(({ order_lines, profiles, ...order }) => {
    const lines = (order_lines ?? []).filter((l) => l.is_active);
    const categoryByUnit = new Map<number, string | null>();
    for (const l of lines) {
      if (l.unit_id) {
        categoryByUnit.set(
          l.unit_id,
          l.article_units?.part ?? l.article_units?.article_models?.categories?.slug ?? null,
        );
      }
    }
    const fields = ticketFields(
      { ...order, notes: null, order_lines: lines },
      { slotOf, categoryOfUnit: (id) => categoryByUnit.get(id) ?? null },
    );
    return {
      ...order,
      costume: fields.costume,
      sizes: costumeSizes(fields),
      tailor: fields.tailor,
      shirt: fields.shirt,
      shoes: fields.shoes,
      accessories: fields.accessories,
      created_by_name: profiles?.full_name ?? null,
    };
  });

  return { rows, total: count ?? 0 };
}

/** « 50 · G 48 · P 52 » — le pantalon n'est écrit que s'il diffère de la veste. */
function costumeSizes(fields: TicketFields): string | null {
  const parts = fields.jacketSize ? [fields.jacketSize] : [];
  if (fields.vestSize) parts.push(`G ${fields.vestSize}`);
  if (fields.pantsSize && fields.pantsSize !== fields.jacketSize) parts.push(`P ${fields.pantsSize}`);
  return parts.join(" · ") || null;
}

/**
 * Commandes dont l'ÉVÉNEMENT tombe entre deux dates incluses — le calendrier
 * et l'onglet « Demain ». C'est la date que le patron saisit et celle que son
 * AppSheet affiche : le mariage, pas le retrait.
 *
 * Les commandes annulées n'y figurent pas : une case de calendrier encombrée
 * d'annulations fait rater les vraies.
 */
export async function getOrdersByEventDate(
  from: IsoDate,
  to: IsoDate,
  q?: string,
): Promise<OrderRow[]> {
  const [supabase, pieceIds] = await Promise.all([createClient(), pieceOrderIds(q)]);
  let request = supabase
    .from("orders")
    .select(ROW_COLUMNS)
    .gte("event_date", from)
    .lte("event_date", to)
    .neq("status", "annulee");
  const search = orderSearchFilter(q, pieceIds);
  if (search) request = request.or(search);

  const { data } = await request
    .order("event_date", { ascending: true })
    .order("customer_name", { ascending: true })
    .order("id", { ascending: true });

  return (data ?? []) as OrderRow[];
}

/**
 * « Li Marj3ouch » — les tenues SORTIES et pas encore revenues. C'est la liste
 * que l'équipe appelle pour récupérer les costumes.
 *
 * Défini par les deux cases et non par le statut : ce sont elles que l'équipe
 * coche, le statut n'en est que la conséquence. Le plus urgent d'abord : le
 * retour prévu le plus ancien.
 */
export async function getNotReturned(q?: string): Promise<OrderRow[]> {
  const [supabase, pieceIds] = await Promise.all([createClient(), pieceOrderIds(q)]);
  let request = supabase
    .from("orders")
    .select(ROW_COLUMNS)
    .eq("picked_up", true)
    .eq("returned", false)
    .neq("status", "annulee");
  const search = orderSearchFilter(q, pieceIds);
  if (search) request = request.or(search);

  const { data } = await request
    .order("return_due_date", { ascending: true })
    .order("id", { ascending: true });

  return (data ?? []) as OrderRow[];
}
