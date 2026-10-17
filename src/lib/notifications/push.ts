import "server-only";

import webpush from "web-push";
import { getTranslations } from "next-intl/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import type { Locale } from "@/i18n/routing";
import { copyOf, messageValues, notificationHref, type NotificationKind } from "./kinds";

type PushInput = {
  recipientIds: string[];
  kind: NotificationKind;
  payload: Json;
  orderId: number | null | undefined;
};

/** 12 h : un rappel du soir livré le surlendemain n'a plus de sens. */
const TTL_SECONDS = 12 * 60 * 60;

function configured(): boolean {
  return Boolean(
    process.env.VAPID_SUBJECT && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY,
  );
}

/**
 * Envoie le push aux appareils des destinataires, dans la langue de chaque
 * appareil. Ne lève jamais : la notification est déjà en base, le push n'est
 * qu'un plus. Les abonnements expirés (404 / 410) sont supprimés au passage.
 */
export async function sendPushForNotification(input: PushInput): Promise<void> {
  if (!configured() || input.recipientIds.length === 0) return;
  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT!,
      process.env.VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    );

    const admin = createAdminClient();
    const { data: subscriptions, error } = await admin
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth, locale")
      .in("user_id", input.recipientIds);
    if (error) throw error;

    // Le compteur de non-lues de chaque destinataire : le service worker le
    // pose sur l'icône de l'app, même fermée.
    const { data: unread, error: unreadError } = await admin
      .from("notifications")
      .select("recipient_id")
      .in("recipient_id", input.recipientIds)
      .is("read_at", null);
    if (unreadError) throw unreadError;
    const badges = new Map<string, number>();
    for (const { recipient_id } of unread ?? []) {
      badges.set(recipient_id, (badges.get(recipient_id) ?? 0) + 1);
    }

    const copy = copyOf(input.kind);
    const values = messageValues(input.payload);
    const href = notificationHref(input.kind, input.orderId ?? null, input.payload);
    // Même commande, même type : le nouveau push remplace l'ancien, sur
    // l'appareil (`tag`) comme dans la file du service push (`topic`).
    const tag = `${input.kind}-${input.orderId ?? "all"}`;

    await Promise.all(
      (subscriptions ?? []).map(async (subscription) => {
        const locale: Locale = subscription.locale === "ar" ? "ar" : "fr";
        const t = await getTranslations({ locale, namespace: "notifications" });
        const message = {
          title: t(copy.title, values),
          body: t(copy.body, values),
          url: `/${locale}${href}`,
          tag,
          badge: badges.get(subscription.user_id) ?? 0,
        };

        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            JSON.stringify(message),
            // `high` : sinon iOS retient le push tant que le téléphone dort
            // (économie d'énergie) et ne le livre qu'au réveil de l'écran.
            { TTL: TTL_SECONDS, urgency: "high", topic: tag.slice(0, 32) },
          );
        } catch (sendError) {
          const statusCode = (sendError as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await admin.from("push_subscriptions").delete().eq("id", subscription.id);
            return;
          }
          console.error("[push] envoi", sendError);
        }
      }),
    );
  } catch (error) {
    console.error("[push] préparation", error);
  }
}
