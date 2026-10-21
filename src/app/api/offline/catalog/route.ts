import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import {
  getLabelSlots,
  getOrderCatalogue,
  getQuickSuggestions,
  getSettings,
} from "@/lib/queries/orders";
import { addDays, todayIso } from "@/lib/rental-range";
import type { OfflineBooking, OfflineCatalog } from "@/lib/offline/types";

/** Réservations gardées : de la veille à un an — tout ce qu'une saisie peut toucher. */
const BOOKINGS_DAYS = 365;
/** PostgREST plafonne SANS PRÉVENIR à 1 000 lignes : on lit par tranches. */
const CHUNK = 1000;

/**
 * Ce qu'il faut au formulaire de commande SANS RÉSEAU : le stock (modèles,
 * pièces, tailles), les clients déjà venus, les réglages (fenêtre J−1 / J+1,
 * nettoyage), la case habituelle de chaque libellé — et les RÉSERVATIONS des
 * pièces, pour avertir qu'une veste est probablement prise.
 *
 * Ces réservations ne décident rien : au retour du réseau, la commande
 * provisoire passe par la base, et la contrainte EXCLUDE tranche.
 *
 * Plus lourd que le cliché des commandes et bien plus stable : le téléphone
 * le relit au plus toutes les 30 minutes. `no-store` : seul IndexedDB le garde.
 */
export async function GET() {
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const today = todayIso();
  const span = `[${addDays(today, -1)},${addDays(today, BOOKINGS_DAYS)})`;
  const supabase = await createClient();

  const [{ models }, { items, customers }, settings, labelSlots] = await Promise.all([
    getOrderCatalogue(),
    getQuickSuggestions(),
    getSettings(),
    getLabelSlots(),
  ]);

  const bookings: OfflineBooking[] = [];
  for (let from = 0; ; from += CHUNK) {
    const { data, error } = await supabase
      .from("order_lines")
      .select("unit_id, order_id, rental_range, orders ( order_no )")
      .eq("is_active", true)
      .not("unit_id", "is", null)
      .filter("rental_range", "ov", span)
      .order("id")
      .range(from, from + CHUNK - 1);
    if (error) return NextResponse.json({ error: "failed" }, { status: 500 });

    type Row = {
      unit_id: number;
      order_id: number;
      rental_range: string | null;
      orders: { order_no: string } | null;
    };
    for (const row of (data ?? []) as unknown as Row[]) {
      if (!row.rental_range) continue;
      bookings.push({
        unitId: row.unit_id,
        orderId: row.order_id,
        orderNo: row.orders?.order_no ?? null,
        range: row.rental_range,
      });
    }
    if (!data || data.length < CHUNK) break;
  }

  const catalog: OfflineCatalog = {
    userId: profile.id,
    syncedAt: new Date().toISOString(),
    models,
    items,
    customers,
    settings,
    labelSlots: [...labelSlots.entries()],
    bookings,
  };
  return NextResponse.json(catalog, { headers: { "Cache-Control": "private, no-store" } });
}
