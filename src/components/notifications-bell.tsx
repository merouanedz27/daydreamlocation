"use client";

import { useEffect, useState, useTransition } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import {
  markAllNotificationsRead,
  markNotificationRead,
  removePushSubscription,
  savePushSubscription,
} from "@/lib/actions/notifications";
import type { NotificationRow } from "@/lib/queries/notifications";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

const COPY_KEYS = {
  order_created: ["orderCreatedTitle", "orderCreatedBody"],
  order_updated: ["orderUpdatedTitle", "orderUpdatedBody"],
  order_cancelled: ["orderCancelledTitle", "orderCancelledBody"],
  order_restored: ["orderRestoredTitle", "orderRestoredBody"],
  tomorrow: ["tomorrowTitle", "tomorrowBody"],
  return_due: ["returnDueTitle", "returnDueBody"],
  return_late: ["returnLateTitle", "returnLateBody"],
} as const;

function payloadValues(notification: NotificationRow): Record<string, string> {
  if (!notification.payload || typeof notification.payload !== "object" || Array.isArray(notification.payload)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(notification.payload).filter(([, value]) => typeof value === "string"),
  ) as Record<string, string>;
}

function decodeKey(value: string): Uint8Array {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

function PushToggle({ locale }: { locale: Locale }) {
  const t = useTranslations();
  const [state, setState] = useState<"loading" | "unsupported" | "off" | "on" | "denied">("loading");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let stopped = false;
    async function inspect() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        if (!stopped) setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!stopped) setState("denied");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!stopped) setState(subscription ? "on" : "off");
    }
    void inspect();
    return () => {
      stopped = true;
    };
  }, []);

  function toggle() {
    startTransition(async () => {
      const registration = await navigator.serviceWorker.ready;
      const current = await registration.pushManager.getSubscription();
      if (current) {
        await current.unsubscribe();
        await removePushSubscription({ endpoint: current.endpoint });
        setState("off");
        return;
      }

      const keyResponse = await fetch("/api/push/vapid-public-key", { cache: "no-store" });
      if (!keyResponse.ok) {
        setState("unsupported");
        return;
      }
      const { key } = (await keyResponse.json()) as { key: string };
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeKey(key).buffer as ArrayBuffer,
      });
      const result = await savePushSubscription({
        locale,
        endpoint: subscription.endpoint,
        p256dh: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey("p256dh")!))),
        auth: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey("auth")!))),
        user_agent: navigator.userAgent,
      });
      if (!result.ok) {
        await subscription.unsubscribe();
        setState("unsupported");
        return;
      }
      setState("on");
    });
  }

  if (state === "unsupported" || state === "denied") {
    return <p className="text-muted-foreground text-xs">{t("notifications.pushUnavailable")}</p>;
  }

  return (
    <Button type="button" variant="outline" onClick={toggle} disabled={pending || state === "loading"} className="h-11 w-full">
      {state === "on" ? t("notifications.pushDisable") : t("notifications.pushEnable")}
    </Button>
  );
}

export function NotificationsBell({
  locale,
  initialCount,
  initialNotifications,
}: {
  locale: Locale;
  initialCount: number;
  initialNotifications: NotificationRow[];
}) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(initialCount);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [pending, startTransition] = useTransition();

  function markRead(notification: NotificationRow) {
    if (notification.read_at) return;
    setNotifications((items) =>
      items.map((item) => (item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item)),
    );
    setCount((value) => Math.max(0, value - 1));
    startTransition(async () => {
      const result = await markNotificationRead({ locale, id: notification.id });
      if (!result.ok) router.refresh();
    });
  }

  function markAllRead() {
    setNotifications((items) =>
      items.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })),
    );
    setCount(0);
    startTransition(async () => {
      const result = await markAllNotificationsRead({ locale });
      if (!result.ok) router.refresh();
    });
  }

  return (
    <Drawer open={open} onOpenChange={setOpen} direction="bottom">
      <DrawerTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-nav-muted hover:bg-nav-foreground/8 hover:text-nav-foreground active:bg-nav-foreground/15 relative size-10"
          aria-label={t("notifications.open")}
        >
          <Bell className="size-5" aria-hidden />
          {count > 0 && (
            <span className="bg-warning text-warning-foreground absolute -inset-e-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="text-start">
          <DrawerTitle>{t("notifications.title")}</DrawerTitle>
          <DrawerDescription>{t("notifications.unread", { count })}</DrawerDescription>
        </DrawerHeader>

        <div className="max-h-[60vh] overflow-y-auto px-4">
          {notifications.length === 0 ? (
            <p className="text-muted-foreground py-12 text-center text-sm">{t("notifications.empty")}</p>
          ) : (
            <ul className="border-border divide-y rounded-lg border">
              {notifications.map((notification) => {
                const keys = COPY_KEYS[notification.kind as keyof typeof COPY_KEYS];
                const values = payloadValues(notification);
                return (
                  <li key={notification.id}>
                    <button
                      type="button"
                      className={cn(
                        "hover:bg-muted flex min-h-16 w-full items-start gap-3 px-3 py-3 text-start",
                        !notification.read_at && "bg-gold-soft/40",
                      )}
                      onClick={() => {
                        markRead(notification);
                        setOpen(false);
                        if (notification.order_id) router.push(`/commandes/${notification.order_id}`);
                      }}
                    >
                      <span className={cn("mt-1 size-2 shrink-0 rounded-full", notification.read_at ? "bg-border" : "bg-primary")} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{t(`notifications.${keys?.[0] ?? "title"}`, values)}</span>
                        <span className="text-muted-foreground block truncate text-sm">
                          {t(`notifications.${keys?.[1] ?? "hint"}`, values)}
                        </span>
                        <span className="text-muted-foreground mt-1 block text-xs">
                          {formatDate(notification.created_at, locale)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DrawerFooter>
          <PushToggle locale={locale} />
          <Button type="button" variant="outline" onClick={markAllRead} disabled={pending || count === 0} className="h-11 w-full">
            <CheckCheck className="size-4" aria-hidden />
            {t("notifications.markAllRead")}
          </Button>
          <DrawerClose asChild>
            <Button type="button" variant="ghost" className="h-11 w-full">{t("common.close")}</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
