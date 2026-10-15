import type { Json } from "@/lib/supabase/database.types";

/**
 * Les types de notification et leur texte — module PUR, partagé entre le
 * serveur (création, Web Push) et la cloche.
 *
 * Quels événements vont dans la cloche et en push : c'est l'administrateur
 * qui le règle (Paramètres → Notifications, `notification-settings.ts`). Une
 * modification ne sonne que si la date, les pièces ou le prix changent ; une
 * note ou un ✈/✓ n'apparaissent que dans la cloche, une ligne par commande.
 */
export type NotificationKind =
  | "order_created"
  | "order_updated"
  | "order_cancelled"
  | "order_restored"
  | "tomorrow"
  | "return_due"
  | "return_late"
  | "daily_summary";

export const COPY: Record<NotificationKind, { title: string; body: string }> = {
  order_created: { title: "orderCreatedTitle", body: "orderCreatedBody" },
  order_updated: { title: "orderUpdatedTitle", body: "orderUpdatedBody" },
  order_cancelled: { title: "orderCancelledTitle", body: "orderCancelledBody" },
  order_restored: { title: "orderRestoredTitle", body: "orderRestoredBody" },
  tomorrow: { title: "tomorrowTitle", body: "tomorrowBody" },
  return_due: { title: "returnDueTitle", body: "returnDueBody" },
  return_late: { title: "returnLateTitle", body: "returnLateBody" },
  daily_summary: { title: "dailySummaryTitle", body: "dailySummaryBody" },
};

export function copyOf(kind: string): { title: string; body: string } {
  return COPY[kind as NotificationKind] ?? { title: "title", body: "hint" };
}

/** Les valeurs ICU du texte : chaînes et nombres du `payload`. */
export function payloadValues(payload: Json): Record<string, string | number> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  return Object.fromEntries(
    Object.entries(payload).filter(
      ([, value]) => typeof value === "string" || typeof value === "number",
    ),
  ) as Record<string, string | number>;
}

/**
 * Les valeurs à passer au texte. Les anciennes lignes `order_updated` n'ont
 * pas les drapeaux « ce qui a changé » : sans valeur par défaut, le `select`
 * ICU lèverait une erreur.
 */
export function messageValues(payload: Json): Record<string, string | number> {
  return { date: "no", pieces: "no", price: "no", ...payloadValues(payload) };
}

/** Où mène la notification, sans préfixe de langue. */
export function notificationHref(kind: string, orderId: number | null, payload: Json): string {
  if (orderId) return `/commandes/${orderId}`;
  if (kind === "daily_summary") {
    const values = payloadValues(payload);
    return Number(values.tomorrow) > 0 ? "/commandes/demain" : "/commandes/pas-rentres";
  }
  return "/commandes";
}
