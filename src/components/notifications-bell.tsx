"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
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
  countUnreadNotifications,
  deleteNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  removePushSubscription,
  savePushSubscription,
} from "@/lib/actions/notifications";
import { copyOf, messageValues, notificationHref } from "@/lib/notifications/kinds";
import {
  decodeKey,
  getPushRegistration,
  pushSupported,
  subscriptionFields,
} from "@/lib/notifications/browser";
import { createClient } from "@/lib/supabase/client";
import type { NotificationRow } from "@/lib/queries/notifications";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

function PushToggle({ locale }: { locale: Locale }) {
  const t = useTranslations();
  const [state, setState] = useState<"loading" | "unsupported" | "off" | "on" | "denied">(
    "loading",
  );
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let stopped = false;
    async function inspect() {
      if (!pushSupported()) {
        if (!stopped) setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!stopped) setState("denied");
        return;
      }
      // Attend l'installation du service worker, aussi longue soit-elle : le
      // bouton reste grisé en attendant, sans message d'erreur trompeur.
      const registration = await getPushRegistration();
      if (!registration) {
        if (!stopped) setState("unsupported");
        return;
      }
      const subscription = await registration.pushManager.getSubscription();
      if (stopped) return;
      setState(subscription ? "on" : "off");
      // À chaque ouverture : l'abonnement suit la personne connectée et la
      // langue affichée, et `last_seen_at` prouve que l'appareil sert encore.
      if (subscription) void savePushSubscription({ locale, ...subscriptionFields(subscription) });
    }
    inspect().catch(() => {
      if (!stopped) setState("unsupported");
    });
    return () => {
      stopped = true;
    };
  }, [locale]);

  function toggle() {
    startTransition(async () => {
      // Une erreur levée dans une transition remonte jusqu'à la page d'erreur :
      // tout est intercepté ici (refus de la permission, réseau…).
      try {
        const registration = await getPushRegistration(20_000);
        if (!registration) {
          toast.error(t("errors.generic"));
          return;
        }
        const current = await registration.pushManager.getSubscription();
        if (current) {
          await removePushSubscription({ endpoint: current.endpoint });
          await current.unsubscribe();
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
          applicationServerKey: decodeKey(key),
        });
        const result = await savePushSubscription({
          locale,
          ...subscriptionFields(subscription),
        });
        if (!result.ok) {
          await subscription.unsubscribe();
          toast.error(t(result.error));
          return;
        }
        setState("on");
      } catch (error) {
        if (Notification.permission === "denied") {
          setState("denied");
          return;
        }
        console.error("[push] activation", error);
        // AbortError : le navigateur n'a pas pu joindre son service push
        // (Brave sans services Google, réseau ou VPN qui bloque FCM…).
        toast.error(
          t(
            error instanceof DOMException && error.name === "AbortError"
              ? "notifications.pushServiceError"
              : "errors.generic",
          ),
        );
      }
    });
  }

  if (state === "unsupported" || state === "denied") {
    return (
      <p className="text-muted-foreground text-xs">
        {t(state === "denied" ? "notifications.pushDenied" : "notifications.pushUnavailable")}
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
      {state === "on" ? t("notifications.pushDisable") : t("notifications.pushEnable")}
    </Button>
  );
}

export function NotificationsBell({
  locale,
  userId,
  initialCount,
}: {
  locale: Locale;
  userId: string;
  initialCount: number;
}) {
  const t = useTranslations();
  const router = useRouter();
  const rtl = locale === "ar";
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(initialCount);
  const [seenInitial, setSeenInitial] = useState(initialCount);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pending, startTransition] = useTransition();
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [swipedId, setSwipedId] = useState<number | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const pointerStart = useRef<{ id: number; x: number; y: number } | null>(
    null,
  );
  const suppressClick = useRef(false);
  const openRef = useRef(false);

  // Le layout a été rendu à nouveau (navigation, revalidation) : son compteur
  // fait foi.
  if (initialCount !== seenInitial) {
    setSeenInitial(initialCount);
    setCount(initialCount);
  }

  /** Relit le badge, et la liste si la cloche est ouverte. */
  const refresh = useCallback(async () => {
    try {
      const [unread, list] = await Promise.all([
        countUnreadNotifications(),
        openRef.current ? listNotifications() : Promise.resolve(null),
      ]);
      setCount(unread);
      if (list) {
        setNotifications(list);
        setLoaded(true);
      }
    } catch (error) {
      console.error("[notifications] actualisation", error);
    }
  }, []);

  // Temps réel : chaque notification créée ou remise à « non lue » pour CETTE
  // personne (RLS filtre aussi côté serveur). En plus, une relecture quand le
  // téléphone revient au premier plan — la connexion a pu dormir.
  useEffect(() => {
    const supabase = createClient();
    let timer: number | undefined;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void refresh(), 300);
    };
    const filter = `recipient_id=eq.${userId}`;
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter }, schedule)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter }, schedule)
      .subscribe();
    const onVisible = () => {
      if (document.visibilityState === "visible") schedule();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [userId, refresh]);

  // Le nombre sur l'icône de l'app installée (barre des tâches, écran
  // d'accueil). Les navigateurs sans Badging API l'ignorent.
  useEffect(() => {
    if (!("setAppBadge" in navigator)) return;
    const done = count > 0 ? navigator.setAppBadge(count) : navigator.clearAppBadge();
    done.catch(() => {});
  }, [count]);

  function onOpenChange(next: boolean) {
    openRef.current = next;
    setOpen(next);
    if (next) void refresh();
  }

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
      const result = await markNotificationRead({ id: notification.id });
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
      const result = await markAllNotificationsRead();
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
      const result = await deleteNotifications({ ids });
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
    // En arabe, le bouton de suppression est à droite : on glisse vers la gauche.
    const deltaX = (event.clientX - start.x) * (rtl ? -1 : 1);
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
    onOpenChange(false);
    router.push(
      notificationHref(notification.kind, notification.order_id, notification.payload),
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="bottom">
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
              {loaded ? t("notifications.empty") : t("common.loading")}
            </p>
          ) : (
            <ul className="border-border divide-y rounded-lg border">
              {notifications.map((notification) => {
                const copy = copyOf(notification.kind);
                const values = messageValues(notification.payload);
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
                            ? `translateX(${rtl ? "-5rem" : "5rem"})`
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
                          {t(`notifications.${copy.title}`, values)}
                        </span>
                        <span className="text-muted-foreground block truncate text-sm">
                          {t(`notifications.${copy.body}`, values)}
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
