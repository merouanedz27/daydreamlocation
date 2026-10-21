import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { addDays, todayIso } from "@/lib/rental-range";
import type { OfflineOrder, OfflineSnapshot } from "@/lib/offline/types";

/** Fenêtre gardée sur le téléphone, autour d'aujourd'hui (date de l'événement). */
const DAYS_BEFORE = 7;
const DAYS_AFTER = 60;
/** PostgREST plafonne à 1 000 lignes ; une boutique en a bien moins sur 67 jours. */
const LIMIT = 1000;

type Raw = Omit<OfflineOrder, "lines" | "balance" | "editLines"> & {
  balance: number | null;
  order_lines: (OfflineOrder["editLines"][number] & { is_active: boolean })[];
};

/**
 * Le cliché hors ligne : ce que le téléphone relira sans réseau.
 *
 *   - les commandes dont l'événement tombe de J−7 à J+60 (demain, la
 *     semaine, la recherche d'un client qui passe) ;
 *   - TOUTES les tenues sorties et pas rentrées, quelle que soit leur date —
 *     c'est la liste qu'on appelle.
 *
 * Les annulées n'y sont pas. La RLS s'applique : un employé ne reçoit que ce
 * qu'il lit déjà dans l'application. `no-store` : ni le navigateur, ni le
 * service worker, ni Vercel ne gardent une copie — seul le téléphone, dans
 * IndexedDB, qu'on efface à la déconnexion.
 */
export async function GET() {
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const today = todayIso();
  const from = addDays(today, -DAYS_BEFORE);
  const to = addDays(today, DAYS_AFTER);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      `id, order_no, customer_name, customer_phone, pickup_date, event_date, return_due_date,
       status, picked_up, returned, total_price, amount_paid, balance, caution_amount,
       caution_returned, notes, version,
       order_lines ( is_active, unit_id, model_name_snapshot, size_snapshot, line_note,
                     external_label, external_source, external_cost,
                     article_units ( ref_code ) )`,
    )
    .neq("status", "annulee")
    .or(
      `and(event_date.gte.${from},event_date.lte.${to}),and(picked_up.eq.true,returned.eq.false)`,
    )
    .order("event_date")
    .order("customer_name")
    .order("id", { referencedTable: "order_lines", ascending: true })
    .limit(LIMIT);

  if (error) return NextResponse.json({ error: "failed" }, { status: 500 });

  const orders: OfflineOrder[] = ((data ?? []) as unknown as Raw[]).map(
    ({ order_lines, ...order }) => {
      const active = (order_lines ?? []).filter((l) => l.is_active);
      return {
        ...order,
        total_price: Number(order.total_price),
        amount_paid: Number(order.amount_paid),
        balance: Number(order.balance ?? 0),
        caution_amount: Number(order.caution_amount),
        lines: active.map((l) => ({
          label: l.model_name_snapshot ?? l.external_label ?? "—",
          size: l.size_snapshot,
          ref: l.article_units?.ref_code ?? null,
        })),
        // De quoi rouvrir la commande dans le formulaire, sans réseau.
        editLines: active.map((l) => ({
          unit_id: l.unit_id,
          model_name_snapshot: l.model_name_snapshot,
          size_snapshot: l.size_snapshot,
          line_note: l.line_note,
          external_label: l.external_label,
          external_source: l.external_source,
          external_cost: l.external_cost === null ? null : Number(l.external_cost),
          article_units: l.article_units,
        })),
      };
    },
  );

  const snapshot: OfflineSnapshot = {
    userId: profile.id,
    syncedAt: new Date().toISOString(),
    today,
    orders,
  };
  return NextResponse.json(snapshot, { headers: { "Cache-Control": "private, no-store" } });
}
