"use client";

import { useCallback, useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertCircle, CloudUpload, RotateCw, Trash2, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Spinner } from "@/components/ui/spinner";
import {
  dropOtherUsers,
  flushOutbox,
  getOutbox,
  OUTBOX_EVENT,
  refreshCatalog,
  refreshSnapshot,
  removeOutboxItem,
  retryOutboxItem,
  setOfflineContext,
} from "@/lib/offline/outbox";
import type { OutboxItem } from "@/lib/offline/types";
import { formatDayMonth, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/routing";

/** Le cliché se refait au plus toutes les 5 minutes, onglet visible. */
const REFRESH_MS = 5 * 60_000;

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** `navigator.onLine`, suivi en direct. Vrai au rendu serveur. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

/** Combien de temps « De nouveau en ligne » reste affiché. */
const BACK_ONLINE_MS = 4000;

/**
 * Le bandeau de connexion, collé sous la barre du haut.
 *
 *   - hors ligne : bandeau ambre, tant que dure la coupure — l'équipe doit
 *     savoir AVANT de toucher que ses gestes partiront plus tard ;
 *   - retour du réseau : bandeau vert « De nouveau en ligne », 4 secondes.
 *   - en ligne : rien. Un badge « en ligne » permanent serait du bruit sur
 *     chaque écran.
 *
 * `role="status"` : un lecteur d'écran annonce le changement sans voler le
 * focus.
 */
export function ConnectionBanner() {
  const t = useTranslations("offline");
  const online = useOnline();
  const [back, setBack] = useState(false);

  useEffect(() => {
    let timer: number | undefined;
    const onOnline = () => {
      setBack(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setBack(false), BACK_ONLINE_MS);
    };
    const onOffline = () => {
      window.clearTimeout(timer);
      setBack(false);
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const show = !online || back;

  return (
    <div role="status" className="sticky top-14 z-30">
      {show && (
        <div
          className={cn(
            "flex min-h-9 items-center justify-center gap-2 border-b px-4 py-1.5 text-center text-sm font-medium",
            online
              ? "border-success/30 bg-success-soft text-success-foreground"
              : "border-warning-foreground/30 bg-warning-soft text-warning-foreground",
          )}
        >
          {online ? (
            <Wifi className="size-4 shrink-0" aria-hidden />
          ) : (
            <WifiOff className="size-4 shrink-0" aria-hidden />
          )}
          <span>{online ? t("bannerBack") : t("bannerOffline")}</span>
        </div>
      )}
    </div>
  );
}

/** La file des gestes, relue à chaque changement. */
export function useOutbox(): OutboxItem[] {
  const [items, setItems] = useState<OutboxItem[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () => getOutbox().then((next) => alive && setItems(next));
    load();
    window.addEventListener(OUTBOX_EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(OUTBOX_EVENT, load);
    };
  }, []);
  return items;
}

/**
 * Le mode hors ligne de l'application, monté une fois dans le layout `(app)`.
 *
 *   1. Il garde sur le téléphone un CLICHÉ des commandes (`/api/offline/
 *      snapshot`) : au chargement, toutes les 5 minutes, au retour du réseau.
 *      Sans réseau, la page « hors ligne » le relit.
 *   2. Il RENVOIE la file des gestes faits sans réseau (✈ / ✓, encaissements,
 *      frais, pointage) dès que le réseau revient ou que l'onglet reprend la
 *      main, puis rafraîchit l'écran.
 *   3. Il le DIT : une pastille au-dessus de la barre basse — « Hors ligne ·
 *      2 en attente », « Envoi… », « 1 refusé » — qui ouvre la liste.
 */
export function OfflineSync({ userId, locale }: { userId: string; locale: Locale }) {
  const t = useTranslations("offline");
  const router = useRouter();
  const online = useOnline();
  const items = useOutbox();
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const sync = useCallback(async () => {
    if (!navigator.onLine) return;
    setSending(true);
    try {
      const { sent, rejected } = await flushOutbox();
      if (sent > 0) {
        toast.success(t("sent", { count: sent }));
        router.refresh();
      }
      if (rejected > 0) toast.error(t("rejectedToast", { count: rejected }));
      await refreshSnapshot();
      // Une commande envoyée a changé les réservations : catalogue relu tout de suite.
      await refreshCatalog(sent > 0);
    } finally {
      setSending(false);
    }
  }, [router, t]);

  useEffect(() => {
    setOfflineContext({ userId, locale });
    let last = 0;
    const run = () => {
      last = Date.now();
      void sync();
    };
    // Un autre compte sur ce téléphone : ses gestes ne partiront pas sous celui-ci.
    void dropOtherUsers(userId).then(run);

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      // La file part toujours ; le cliché, seulement s'il a vieilli.
      if (Date.now() - last > REFRESH_MS) run();
      else void flushOutbox();
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") run();
    }, REFRESH_MS);

    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId, locale, sync]);

  const mine = items.filter((i) => i.userId === userId);
  const pending = mine.filter((i) => i.status === "pending").length;
  const rejected = mine.filter((i) => i.status === "rejected").length;

  if (online && mine.length === 0) return null;

  const label = !online
    ? pending
      ? t("offlinePending", { count: pending })
      : t("offlineShort")
    : rejected
      ? t("rejectedCount", { count: rejected })
      : t("sending", { count: pending });

  return (
    <>
      {/* Au-dessus de la barre basse, centrée : le bouton « + » occupe le coin. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-live="polite"
        className={cn(
          "press fixed inset-x-0 z-40 mx-auto flex min-h-11 w-fit max-w-[calc(100%-10rem)] items-center gap-2 rounded-full border px-4 text-sm font-medium shadow-md",
          "bottom-[calc(3.5rem+env(safe-area-inset-bottom)+1.25rem)] md:bottom-4",
          rejected && online
            ? "border-destructive/40 bg-card text-destructive"
            : !online
              ? "border-warning-foreground/30 bg-warning-soft text-warning-foreground"
              : "border-border bg-card",
        )}
      >
        {!online ? (
          <WifiOff className="size-4 shrink-0" aria-hidden />
        ) : rejected ? (
          <AlertCircle className="size-4 shrink-0" aria-hidden />
        ) : (
          <Spinner className="size-4 shrink-0" />
        )}
        <span className="truncate">{label}</span>
      </button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="max-h-[85svh]">
          <DrawerHeader className="text-start">
            <DrawerTitle>{t("queueTitle")}</DrawerTitle>
            <DrawerDescription>{online ? t("queueHintOnline") : t("queueHintOffline")}</DrawerDescription>
          </DrawerHeader>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-6">
            {!online && (
              // Navigation complète : sans réseau, le service worker sert la
              // page « hors ligne », qui relit le cliché.
              <div className="grid grid-cols-2 gap-2">
                <Button asChild variant="outline" className="h-12 text-sm">
                  <a href={`/${locale}/hors-ligne`}>{t("openViewer")}</a>
                </Button>
                <Button asChild variant="outline" className="h-12 text-sm">
                  <a href={`/${locale}/hors-ligne/nouvelle`}>{t("newOrder")}</a>
                </Button>
              </div>
            )}

            {mine.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">{t("queueEmpty")}</p>
            ) : (
              <ul className="border-border divide-border divide-y rounded-lg border">
                {mine.map((item) => (
                  <QueueRow key={item.id} item={item} locale={locale} />
                ))}
              </ul>
            )}

            {online && pending > 0 && (
              <Button
                type="button"
                className="h-12 w-full text-base"
                disabled={sending}
                onClick={() => void sync()}
              >
                {sending ? <Spinner /> : <CloudUpload className="size-4" aria-hidden />}
                {t("sendNow")}
              </Button>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}

function QueueRow({ item, locale }: { item: OutboxItem; locale: Locale }) {
  const t = useTranslations();
  const [isPending, startTransition] = useTransition();
  const rejected = item.status === "rejected";

  return (
    <li className="flex items-center gap-2 py-2 ps-3 pe-1">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.title}</p>
        <p className={cn("text-xs", rejected ? "text-destructive" : "text-muted-foreground")}>
          {rejected
            ? t("offline.rejectedBecause", { reason: t(item.error ?? "errors.generic") })
            : t("offline.pendingSince", {
                date: formatDayMonth(item.createdAt, locale),
                time: formatTime(item.createdAt, locale),
              })}
        </p>
      </div>
      {rejected && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11 shrink-0"
          disabled={isPending}
          onClick={() => startTransition(() => retryOutboxItem(item.id))}
        >
          <RotateCw className="size-4" aria-hidden />
          <span className="sr-only">{t("offline.retryItem", { title: item.title })}</span>
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-muted-foreground size-11 shrink-0"
        disabled={isPending}
        onClick={() => startTransition(() => removeOutboxItem(item.id))}
      >
        <Trash2 className="size-4" aria-hidden />
        <span className="sr-only">{t("offline.removeItem", { title: item.title })}</span>
      </Button>
    </li>
  );
}
