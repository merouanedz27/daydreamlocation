"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Bell, CheckCheck, ListChecks, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
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
  deleteNotifications,
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
  if (
    !notification.payload ||
    typeof notification.payload !== "object" ||
    Array.isArray(notification.payload)
  ) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(notification.payload).filter(
      ([, value]) => typeof value === "string",
    ),
  ) as Record<string, string>;
}

function decodeKey(value: string): Uint8Array {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

async function getPushRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (process.env.NODE_ENV === "development") return null;

  const registration = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) =>
      window.setTimeout(() => resolve(null), 5000),
    ),
  ]);
  return registration;
}

function PushToggle({ locale }: { locale: Locale }) {
  const t = useTranslations();
  const [state, setState] = useState<
    "loading" | "unsupported" | "off" | "on" | "denied"
  >("loading");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let stopped = false;
    async function inspect() {
      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        if (!stopped) setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!stopped) setState("denied");
        return;
      }
      const registration = await getPushRegistration();
      if (!registration) {
        if (!stopped) setState("unsupported");
        return;
      }
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
      const registration = await getPushRegistration();
      if (!registration) {
        setState("unsupported");
        return;
      }
      const current = await registration.pushManager.getSubscription();
      if (current) {
        await current.unsubscribe();
        await removePushSubscription({ endpoint: current.endpoint });
        setState("off");
        return;
      }

      const keyResponse = await fetch("/api/push/vapid-public-key", {
        cache: "no-store",
      });
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
        p256dh: btoa(
          String.fromCharCode(
            ...new Uint8Array(subscription.getKey("p256dh")!),
          ),
        ),
        auth: btoa(
          String.fromCharCode(...new Uint8Array(subscription.getKey("auth")!)),
        ),
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
    return (
      <p className="text-muted-foreground text-xs">
        {t("notifications.pushUnavailable")}
      </p>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={toggle}
      disabled={pending || state === "loading"}
      className="h-11 w-full"
    >
      {state === "on"
        ? t("notifications.pushDisable")
        : t("notifications.pushEnable")}
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
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [swipedId, setSwipedId] = useState<number | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const pointerStart = useRef<{ id: number; x: number; y: number } | null>(
    null,
  );
  const suppressClick = useRef(false);

  function markRead(notification: NotificationRow) {
    if (notification.read_at) return;
    setNotifications((items) =>
      items.map((item) =>
        item.id === notification.id
          ? { ...item, read_at: new Date().toISOString() }
          : item,
      ),
    );
    setCount((value) => Math.max(0, value - 1));
    startTransition(async () => {
      const result = await markNotificationRead({
        locale,
        id: notification.id,
      });
      if (!result.ok) router.refresh();
    });
  }

  function markAllRead() {
    setNotifications((items) =>
      items.map((item) => ({
        ...item,
        read_at: item.read_at ?? new Date().toISOString(),
      })),
    );
    setCount(0);
    startTransition(async () => {
      const result = await markAllNotificationsRead({ locale });
      if (!result.ok) router.refresh();
    });
  }

  function stopLongPress() {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function enterSelection(id: number) {
    stopLongPress();
    suppressClick.current = true;
    setSelectionMode(true);
    setSelectedIds((ids) => new Set(ids).add(id));
    navigator.vibrate?.(10);
  }

  function toggleSelection(id: number) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (next.size === 0) setSelectionMode(false);
      return next;
    });
  }

  function selectAll() {
    setSelectionMode(true);
    setSelectedIds((current) =>
      current.size === notifications.length
        ? new Set()
        : new Set(notifications.map((notification) => notification.id)),
    );
  }

  function deleteIds(ids: number[]) {
    if (ids.length === 0) return;
    const selected = new Set(ids);
    const unreadDeleted = notifications.filter(
      (notification) => selected.has(notification.id) && !notification.read_at,
    ).length;
    setNotifications((items) => items.filter((item) => !selected.has(item.id)));
    setCount((value) => Math.max(0, value - unreadDeleted));
    setSelectedIds(new Set());
    setSelectionMode(false);
    setSwipedId(null);
    startTransition(async () => {
      const result = await deleteNotifications({ locale, ids });
      if (!result.ok) {
        toast.error(t(result.error));
        router.refresh();
        return;
      }
      toast.success(t("notifications.deletedToast"));
    });
  }

  function onPointerDown(id: number, event: React.PointerEvent) {
    if (event.pointerType !== "touch") return;
    pointerStart.current = { id, x: event.clientX, y: event.clientY };
    longPressTimer.current = window.setTimeout(() => enterSelection(id), 550);
  }

  function onPointerMove(event: React.PointerEvent) {
    const start = pointerStart.current;
    if (!start || event.pointerType !== "touch") return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) > 12 || Math.abs(deltaY) > 12) stopLongPress();
    if (Math.abs(deltaX) > Math.abs(deltaY) && deltaX > 56)
      setSwipedId(start.id);
  }

  function onPointerUp() {
    stopLongPress();
    pointerStart.current = null;
  }

  function onNotificationClick(notification: NotificationRow) {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (selectionMode) {
      toggleSelection(notification.id);
      return;
    }
    if (swipedId === notification.id) {
      setSwipedId(null);
      return;
    }
    markRead(notification);
    setOpen(false);
    if (notification.order_id)
      router.push(`/commandes/${notification.order_id}`);
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
            <span className="bg-notification-badge text-notification-badge-foreground absolute -inset-e-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="text-start">
          <DrawerTitle>{t("notifications.title")}</DrawerTitle>
          <DrawerDescription>
            {t("notifications.unread", { count })}
          </DrawerDescription>
        </DrawerHeader>

        {selectionMode && (
          <div className="flex items-center gap-2 px-4 pb-3">
            <Button
              type="button"
              variant="outline"
              onClick={selectAll}
              className="h-10 flex-1"
            >
              <ListChecks className="size-4" aria-hidden />
              {selectedIds.size === notifications.length
                ? t("notifications.deselectAll")
                : t("notifications.selectAll")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => deleteIds([...selectedIds])}
              disabled={pending}
              className="h-10"
            >
              <Trash2 className="size-4" aria-hidden />
              <span className="sr-only">
                {t("notifications.deleteSelected")}
              </span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => {
                setSelectionMode(false);
                setSelectedIds(new Set());
              }}
              className="size-10"
              aria-label={t("notifications.cancelSelection")}
            >
              <X className="size-4" aria-hidden />
            </Button>
          </div>
        )}

        <div className="max-h-[60vh] overflow-y-auto px-4">
          {notifications.length === 0 ? (
            <p className="text-muted-foreground py-12 text-center text-sm">
              {t("notifications.empty")}
            </p>
          ) : (
            <ul className="border-border divide-y rounded-lg border">
              {notifications.map((notification) => {
                const keys =
                  COPY_KEYS[notification.kind as keyof typeof COPY_KEYS];
                const values = payloadValues(notification);
                return (
                  <li
                    key={notification.id}
                    className="relative overflow-hidden"
                    onPointerDown={(event) =>
                      onPointerDown(notification.id, event)
                    }
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      enterSelection(notification.id);
                    }}
                  >
                    <button
                      type="button"
                      className={cn(
                        "bg-destructive/15 text-destructive pointer-events-none absolute inset-s-0 inset-y-0 flex w-20 items-center justify-center opacity-0 transition-opacity",
                        swipedId === notification.id &&
                          "pointer-events-auto opacity-100",
                      )}
                      aria-label={t("common.delete")}
                      title={t("common.delete")}
                      onClick={() => deleteIds([notification.id])}
                    >
                      <Trash2 className="size-5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-pressed={
                        selectionMode
                          ? selectedIds.has(notification.id)
                          : undefined
                      }
                      className={cn(
                        "hover:bg-muted relative z-10 flex min-h-16 w-full touch-pan-y items-start gap-3 bg-popover px-3 py-3 text-start transition-transform",
                        !notification.read_at && "bg-gold-soft/40",
                        selectedIds.has(notification.id) &&
                          "ring-ring ring-2 ring-inset",
                      )}
                      style={{
                        transform:
                          swipedId === notification.id
                            ? "translateX(5rem)"
                            : undefined,
                      }}
                      onClick={() => onNotificationClick(notification)}
                    >
                      {selectionMode ? (
                        <span
                          className={cn(
                            "mt-1 flex size-5 shrink-0 items-center justify-center rounded border",
                            selectedIds.has(notification.id)
                              ? "border-transparent bg-primary text-primary-foreground"
                              : "border-border",
                          )}
                          aria-hidden
                        >
                          {selectedIds.has(notification.id) && (
                            <CheckCheck className="size-3" />
                          )}
                        </span>
                      ) : (
                        <span
                          className={cn(
                            "mt-1 size-2 shrink-0 rounded-full",
                            notification.read_at ? "bg-border" : "bg-primary",
                          )}
                          aria-hidden
                        />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">
                          {t(`notifications.${keys?.[0] ?? "title"}`, values)}
                        </span>
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
          <Button
            type="button"
            variant="outline"
            onClick={markAllRead}
            disabled={pending || count === 0}
            className="h-11 w-full"
          >
            <CheckCheck className="size-4" aria-hidden />
            {t("notifications.markAllRead")}
          </Button>
          <DrawerClose asChild>
            <Button type="button" variant="ghost" className="h-11 w-full">
              {t("common.close")}
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
