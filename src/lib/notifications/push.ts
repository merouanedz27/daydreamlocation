import "server-only";

import webpush from "web-push";
import { getTranslations } from "next-intl/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import type { Locale } from "@/i18n/routing";

type PushInput = {
  recipientIds: string[];
  titleKey: string;
  bodyKey: string;
  payload: Json;
  orderId: number | null | undefined;
};

function configured(): boolean {
  return Boolean(
    process.env.VAPID_SUBJECT && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY,
  );
}

function values(payload: Json): Record<string, string> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => typeof value === "string"),
  ) as Record<string, string>;
}

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

    await Promise.all(
      (subscriptions ?? []).map(async (subscription) => {
      const locale: Locale = subscription.locale === "ar" ? "ar" : "fr";
      const t = await getTranslations({ locale });
      const notification = {
        title: t(input.titleKey, values(input.payload)),
        body: t(input.bodyKey, values(input.payload)),
        url: input.orderId ? `/${locale}/commandes/${input.orderId}` : `/${locale}/commandes`,
        tag: `${input.titleKey}:${input.orderId ?? "general"}`,
      };

      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify(notification),
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