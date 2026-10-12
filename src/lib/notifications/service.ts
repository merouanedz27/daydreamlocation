import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/database.types";
import { sendPushForNotification } from "@/lib/notifications/push";

export type NotificationKind =
  | "order_created"
  | "order_updated"
  | "order_cancelled"
  | "order_restored"
  | "tomorrow"
  | "return_due"
  | "return_late";

export type NotificationInput = {
  kind: NotificationKind;
  titleKey: string;
  bodyKey: string;
  payload?: Json;
  orderId?: number | null;
  dedupeKey: string;
};

type NotificationInsert = Database["public"]["Tables"]["notifications"]["Insert"];

const EVENT_COPY: Record<NotificationKind, { titleKey: string; bodyKey: string }> = {
  order_created: {
    titleKey: "orderCreatedTitle",
    bodyKey: "orderCreatedBody",
  },
  order_updated: {
    titleKey: "orderUpdatedTitle",
    bodyKey: "orderUpdatedBody",
  },
  order_cancelled: {
    titleKey: "orderCancelledTitle",
    bodyKey: "orderCancelledBody",
  },
  order_restored: {
    titleKey: "orderRestoredTitle",
    bodyKey: "orderRestoredBody",
  },
  tomorrow: {
    titleKey: "tomorrowTitle",
    bodyKey: "tomorrowBody",
  },
  return_due: {
    titleKey: "returnDueTitle",
    bodyKey: "returnDueBody",
  },
  return_late: {
    titleKey: "returnLateTitle",
    bodyKey: "returnLateBody",
  },
};

/**
 * Crée une notification pour chaque membre actif de l'équipe.
 *
 * L'upsert ignore les doublons afin que les retries de Vercel et les
 * revalidations serveur restent sans effet secondaire.
 */
export async function notifyActiveTeam(input: NotificationInput): Promise<void> {
  const admin = createAdminClient();
  const members = await getActiveMemberIds(admin);
  if (!members.length) return;

  const rows: NotificationInsert[] = members.map((id) => ({
    recipient_id: id,
    order_id: input.orderId ?? null,
    kind: input.kind,
    title_key: input.titleKey,
    body_key: input.bodyKey,
    payload: input.payload ?? {},
    dedupe_key: input.dedupeKey,
  }));

  const { data: inserted, error } = await admin
    .from("notifications")
    .upsert(rows, {
    onConflict: "recipient_id,dedupe_key",
    ignoreDuplicates: true,
    })
    .select("recipient_id");
  if (error) throw error;
  const insertedRecipients = (inserted ?? []).map(({ recipient_id }) => recipient_id);
  if (!insertedRecipients.length) return;
  await sendPushForNotification({
    recipientIds: insertedRecipients,
    titleKey: input.titleKey,
    bodyKey: input.bodyKey,
    payload: input.payload ?? {},
    orderId: input.orderId,
  });
}

async function getActiveMemberIds(admin: ReturnType<typeof createAdminClient>): Promise<string[]> {
  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .eq("is_active", true)
    .in("role", ["staff", "moderator", "owner"]);
  if (error) throw error;
  return (data ?? []).map(({ id }) => id);
}

export async function notifyDailyReminders(day: string): Promise<number> {
  const admin = createAdminClient();
  const [{ data: members, error: membersError }, { data: orders, error: ordersError }] =
    await Promise.all([
      admin
        .from("profiles")
        .select("id")
        .eq("is_active", true)
        .in("role", ["staff", "moderator", "owner"]),
      admin
        .from("orders")
        .select("id, order_no, customer_name, event_date, return_due_date, picked_up, returned, status")
        .neq("status", "annulee")
        .or(`event_date.eq.${day},return_due_date.lte.${day}`),
    ]);

  if (membersError) throw membersError;
  if (ordersError) throw ordersError;
  if (!members?.length || !orders?.length) return 0;

  const rows: NotificationInsert[] = [];
  const reminders: {
    kind: Extract<NotificationKind, "tomorrow" | "return_due" | "return_late">;
    copy: { titleKey: string; bodyKey: string };
    payload: Json;
    orderId: number;
    dedupeKey: string;
  }[] = [];
  for (const order of orders) {
    const isTomorrow = order.event_date === day;
    const isReturn = order.picked_up && !order.returned && order.return_due_date <= day;
    if (!isTomorrow && !isReturn) continue;

    const kind: Extract<NotificationKind, "tomorrow" | "return_due" | "return_late"> = isTomorrow
      ? "tomorrow"
      : order.return_due_date === day
        ? "return_due"
        : "return_late";
    const copy = EVENT_COPY[kind];
    const payload = {
      orderNo: order.order_no,
      customerName: order.customer_name,
      eventDate: order.event_date,
      returnDueDate: order.return_due_date,
    } satisfies Json;
    for (const member of members) {
      rows.push({
        recipient_id: member.id,
        order_id: order.id,
        kind,
        title_key: `notifications.${copy.titleKey}`,
        body_key: `notifications.${copy.bodyKey}`,
        payload,
        dedupe_key: `${kind}:order:${order.id}:${day}`,
      });
    }
    reminders.push({
      kind,
      copy,
      payload,
      orderId: order.id,
      dedupeKey: `${kind}:order:${order.id}:${day}`,
    });
  }

  if (!rows.length) return 0;
  const { data: inserted, error } = await admin
    .from("notifications")
    .upsert(rows, {
      onConflict: "recipient_id,dedupe_key",
      ignoreDuplicates: true,
    })
    .select("recipient_id, dedupe_key");
  if (error) throw error;
  const recipientsByDedupe = new Map<string, string[]>();
  for (const row of inserted ?? []) {
    const recipients = recipientsByDedupe.get(row.dedupe_key) ?? [];
    recipients.push(row.recipient_id);
    recipientsByDedupe.set(row.dedupe_key, recipients);
  }
  await Promise.all(
    reminders.map((reminder) => {
      const recipientIds = recipientsByDedupe.get(reminder.dedupeKey) ?? [];
      return sendPushForNotification({
        recipientIds,
        titleKey: `notifications.${reminder.copy.titleKey}`,
        bodyKey: `notifications.${reminder.copy.bodyKey}`,
        payload: reminder.payload,
        orderId: reminder.orderId,
      });
    }),
  );
  return rows.length;
}

export async function notifyOrderEvent(
  orderId: number,
  kind: Extract<NotificationKind, "order_created" | "order_updated" | "order_cancelled" | "order_restored">,
): Promise<void> {
  const admin = createAdminClient();
  const { data: order, error } = await admin
    .from("orders")
    .select("id, order_no, customer_name, event_date, return_due_date, created_at, updated_at")
    .eq("id", orderId)
    .maybeSingle();

  if (error) throw error;
  if (!order) return;

  const copy = EVENT_COPY[kind];
  const version = kind === "order_created" ? order.created_at : order.updated_at;
  await notifyActiveTeam({
    kind,
    titleKey: `notifications.${copy.titleKey}`,
    bodyKey: `notifications.${copy.bodyKey}`,
    orderId,
    dedupeKey: `${kind}:order:${orderId}:${version}`,
    payload: {
      orderNo: order.order_no,
      customerName: order.customer_name,
      eventDate: order.event_date,
      returnDueDate: order.return_due_date,
    },
  });
}
