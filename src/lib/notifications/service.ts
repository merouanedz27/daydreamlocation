import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/database.types";
import { sendPushForNotification } from "@/lib/notifications/push";
import { COPY, type NotificationKind } from "@/lib/notifications/kinds";
import { parseRules, type Rule, type RuleKind } from "@/lib/notification-settings";

type Admin = ReturnType<typeof createAdminClient>;
type NotificationInsert = Database["public"]["Tables"]["notifications"]["Insert"];
type OrderEventKind = Extract<
  NotificationKind,
  "order_created" | "order_updated" | "order_cancelled" | "order_restored"
>;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Ce qui, dans une commande, mérite un push quand ça change. */
export type OrderSnapshot = { eventDate: string; total: number; pieces: string };

/**
 * L'état « important » d'une commande : date de l'événement, prix total, et
 * la liste des pièces actives (pièce du stock, pièce externe, taille).
 * À prendre AVANT l'enregistrement, pour comparer après.
 */
export async function snapshotOrder(orderId: number): Promise<OrderSnapshot | null> {
  const admin = createAdminClient();
  const [order, lines] = await Promise.all([
    admin.from("orders").select("event_date, total_price").eq("id", orderId).maybeSingle(),
    admin
      .from("order_lines")
      .select("unit_id, external_label, size_snapshot")
      .eq("order_id", orderId)
      .eq("is_active", true),
  ]);
  if (order.error) throw order.error;
  if (lines.error) throw lines.error;
  if (!order.data) return null;
  const pieces = (lines.data ?? [])
    .map((l) => `${l.unit_id ?? "x"}:${l.external_label ?? ""}:${l.size_snapshot ?? ""}`)
    .sort()
    .join("|");
  return { eventDate: order.data.event_date, total: order.data.total_price, pieces };
}

function changesBetween(before: OrderSnapshot, after: OrderSnapshot) {
  return {
    date: before.eventDate !== after.eventDate,
    pieces: before.pieces !== after.pieces,
    price: before.total !== after.total,
  };
}

async function getActiveMemberIds(admin: Admin): Promise<string[]> {
  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .eq("is_active", true)
    .in("role", ["staff", "moderator", "owner"]);
  if (error) throw error;
  return (data ?? []).map(({ id }) => id);
}

/**
 * La règle de l'administrateur pour cet événement (écran Paramètres →
 * Notifications). Une lecture ratée retombe sur « tout activé » : mieux vaut
 * une alerte de trop qu'une commande passée sous silence.
 */
async function getRule(admin: Admin, kind: RuleKind): Promise<Rule> {
  const { data, error } = await admin
    .from("settings")
    .select("notification_rules")
    .eq("id", true)
    .maybeSingle();
  if (error) console.error("[notifications] règles", error);
  return parseRules(data?.notification_rules)[kind];
}

function rowsFor(
  members: string[],
  kind: NotificationKind,
  fields: { orderId: number | null; payload: Json; dedupeKey: string },
): NotificationInsert[] {
  return members.map((id) => ({
    recipient_id: id,
    order_id: fields.orderId,
    kind,
    title_key: `notifications.${COPY[kind].title}`,
    body_key: `notifications.${COPY[kind].body}`,
    payload: fields.payload,
    dedupe_key: fields.dedupeKey,
  }));
}

/**
 * Une commande créée, modifiée, annulée ou réactivée : une ligne par membre
 * actif, sauf l'auteur — une action ne produit pas sa propre alerte.
 *
 * - `order_updated` : UNE ligne par commande et par membre, qui remonte en
 *   « non lue » à chaque modification. Push SEULEMENT si la date, les pièces
 *   ou le prix ont changé (`before` = état pris avant l'enregistrement). Une
 *   note, un téléphone ou un ✈/✓ restent silencieux.
 * - les autres : une ligne par version (doublons ignorés : les retries
 *   restent sans effet), et un push.
 *
 * Chaque canal suit la règle de l'administrateur : cloche coupée = aucune
 * ligne ; push coupé = aucun push. Cloche coupée mais push actif : le push
 * part directement, sans ligne (le badge ne bouge pas).
 */
export async function notifyOrderEvent(
  orderId: number,
  kind: OrderEventKind,
  actorId?: string,
  before?: OrderSnapshot | null,
): Promise<void> {
  const admin = createAdminClient();
  const rule = await getRule(admin, kind);
  if (!rule.bell && !rule.push) return;

  const [{ data: order, error }, allMembers] = await Promise.all([
    admin
      .from("orders")
      .select("id, order_no, customer_name, event_date, return_due_date, created_at, updated_at")
      .eq("id", orderId)
      .maybeSingle(),
    getActiveMemberIds(admin),
  ]);
  if (error) throw error;
  if (!order) return;

  const members = allMembers.filter((id) => id !== actorId);
  if (!members.length) return;

  const payload = {
    orderNo: order.order_no,
    customerName: order.customer_name,
    eventDate: order.event_date,
    returnDueDate: order.return_due_date,
  } satisfies Json;

  if (kind === "order_updated") {
    const current = before ? await snapshotOrder(orderId) : null;
    const changes =
      before && current ? changesBetween(before, current) : { date: false, pieces: false, price: false };
    const important = changes.date || changes.pieces || changes.price;
    // Le texte dit ce qui a changé : « · nouvelle date · pièces changées ».
    const updatePayload = {
      ...payload,
      date: changes.date ? "yes" : "no",
      pieces: changes.pieces ? "yes" : "no",
      price: changes.price ? "yes" : "no",
    } satisfies Json;

    if (rule.bell) {
      const rows = rowsFor(members, kind, {
        orderId,
        payload: updatePayload,
        dedupeKey: `order_updated:order:${orderId}`,
      }).map((row) => ({ ...row, read_at: null, created_at: new Date().toISOString() }));
      const { error: upsertError } = await admin
        .from("notifications")
        .upsert(rows, { onConflict: "recipient_id,dedupe_key" });
      if (upsertError) throw upsertError;
    }

    if (rule.push && important) {
      await sendPushForNotification({ recipientIds: members, kind, payload: updatePayload, orderId });
    }
    return;
  }

  if (!rule.bell) {
    await sendPushForNotification({ recipientIds: members, kind, payload, orderId });
    return;
  }

  const version = kind === "order_created" ? order.created_at : order.updated_at;
  const rows = rowsFor(members, kind, {
    orderId,
    payload,
    dedupeKey: `${kind}:order:${orderId}:${version}`,
  });
  const { data: inserted, error: insertError } = await admin
    .from("notifications")
    .upsert(rows, { onConflict: "recipient_id,dedupe_key", ignoreDuplicates: true })
    .select("recipient_id");
  if (insertError) throw insertError;

  if (!rule.push) return;
  // Seuls les destinataires d'une ligne NOUVELLE : un retry ne renvoie rien.
  await sendPushForNotification({
    recipientIds: (inserted ?? []).map(({ recipient_id }) => recipient_id),
    kind,
    payload,
    orderId,
  });
}

/**
 * Le résumé du soir : UNE notification par membre — combien de mariages
 * demain, combien de retours attendus aujourd'hui, combien en retard. Rien
 * si tout est à zéro. Idempotent par jour (`daily:{today}`).
 *
 * Renvoie le nombre de membres notifiés.
 */
export async function notifyDailySummary(today: string, tomorrow: string): Promise<number> {
  const admin = createAdminClient();
  const rule = await getRule(admin, "daily_summary");
  if (!rule.bell && !rule.push) return 0;

  const [members, events, returns] = await Promise.all([
    getActiveMemberIds(admin),
    admin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("event_date", tomorrow)
      .neq("status", "annulee"),
    // Seules les sorties non revenues : la requête ne relit jamais l'historique.
    admin
      .from("orders")
      .select("return_due_date")
      .eq("picked_up", true)
      .eq("returned", false)
      .lte("return_due_date", today)
      .neq("status", "annulee"),
  ]);
  if (events.error) throw events.error;
  if (returns.error) throw returns.error;

  const due = (returns.data ?? []).filter((o) => o.return_due_date === today).length;
  const late = (returns.data ?? []).length - due;
  const payload = { tomorrow: events.count ?? 0, due, late } satisfies Json;
  if (!members.length || payload.tomorrow + due + late === 0) return 0;

  if (!rule.bell) {
    await sendPushForNotification({ recipientIds: members, kind: "daily_summary", payload, orderId: null });
    return members.length;
  }

  const rows = rowsFor(members, "daily_summary", {
    orderId: null,
    payload,
    dedupeKey: `daily:${today}`,
  });
  const { data: inserted, error } = await admin
    .from("notifications")
    .upsert(rows, { onConflict: "recipient_id,dedupe_key", ignoreDuplicates: true })
    .select("recipient_id");
  if (error) throw error;

  const recipientIds = (inserted ?? []).map(({ recipient_id }) => recipient_id);
  if (rule.push) {
    await sendPushForNotification({ recipientIds, kind: "daily_summary", payload, orderId: null });
  }
  return recipientIds.length;
}

/**
 * Ménage du soir : les notifications lues de plus de 60 jours, toutes celles
 * de plus de 120 jours, et les appareils muets depuis 90 jours (la cloche
 * rafraîchit `last_seen_at` à chaque ouverture de l'app).
 */
export async function pruneNotifications(now: Date = new Date()): Promise<void> {
  const admin = createAdminClient();
  const ago = (days: number) => new Date(now.getTime() - days * DAY_MS).toISOString();
  const results = await Promise.all([
    admin.from("notifications").delete().lt("read_at", ago(60)),
    admin.from("notifications").delete().lt("created_at", ago(120)),
    admin.from("push_subscriptions").delete().lt("last_seen_at", ago(90)),
  ]);
  for (const { error } of results) if (error) throw error;
}
