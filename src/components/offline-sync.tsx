"use client";

import { useCallback, useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
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
import { useParams } from "next/navigation";
import {
  dropOtherUsers,
  flushOutbox,
  getOutbox,
  OUTBOX_EVENT,
  refreshCatalog,
  removeOutboxItem,
  retryOutboxItem,
  setOfflineContext,
} from "@/lib/offline/outbox";
import type { OutboxItem } from "@/lib/offline/types";
import { keepPage, keepPages, pageCachedAt, rememberLocale } from "@/lib/offline/pages";
import { formatDayMonth, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/routing";

/** La file part, et les écrans gardés sont revus, toutes les 5 minutes (onglet visible). */
const REFRESH_MS = 5 * 60_000;
/** Écrans du quotidien : regardés au plus tous les quarts d'heure. */
const PAGES_MAX_AGE_MS = 15 * 60_000;
/** Fiches commande : au plus toutes les heures — elles sont plus nombreuses. */
const DETAILS_MAX_AGE_MS = 60 * 60_000;
/** L'écran affiché : regardé au plus toutes les 10 minutes. */
const CURRENT_MAX_AGE_MS = 10 * 60_000;
/** Les listes que touche un geste envoyé : regardées tout de suite après. */
const LISTS_AFTER_SEND = ["/commandes", "/commandes/demain", "/commandes/pas-rentres"];

/**
 * Les écrans à garder (`/api/offline/pages`), l'un après l'autre : d'abord
 * ceux du quotidien, puis les fiches des commandes en cours.
 */
async function keepAppPages(locale: string) {
  try {
    const response = await fetch(`/api/offline/pages?locale=${locale}`, {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!response.ok) return;
    const { pages, details } = (await response.json()) as { pages: string[]; details: string[] };
    await keepPages(pages, PAGES_MAX_AGE_MS);
    await keepPages(details, DETAILS_MAX_AGE_MS);
  } catch {
    /* hors ligne entre-temps : on réessaiera */
  }
}

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
 *     savoir AVANT de toucher que ses gestes partiront plus tard, et DE QUAND
 *     date l'écran qu'elle regarde (« page de 14:32 ») ;
 *   - retour du réseau : bandeau vert « De nouveau en ligne », 4 secondes.
 *   - en ligne : rien. Un badge « en ligne » permanent serait du bruit sur
 *     chaque écran.
 *
 * `role="status"` : un lecteur d'écran annonce le changement sans voler le
 * focus.
 */
export function ConnectionBanner() {
  const t = useTranslations("offline");
  const { locale } = useParams<{ locale: Locale }>();
  const online = useOnline();
  const pathname = usePathname();
  const [back, setBack] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);

  // L'heure de l'écran affiché, telle que le cache des écrans la connaît.
  useEffect(() => {
    if (online) return;
    let alive = true;
    void pageCachedAt(window.location.pathname + window.location.search).then((at) => {
      if (alive) setCachedAt(at);
    });
    return () => {
      alive = false;
    };
  }, [online, pathname]);

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
          <span>
            {online
              ? t("bannerBack")
              : cachedAt
                ? t("bannerOfflineAt", {
                    date: formatDayMonth(cachedAt, locale),
                    time: formatTime(cachedAt, locale),
                  })
                : t("bannerOffline")}
          </span>
        </div>
      )}
    </div>
  );
}

const NO_ITEMS: OutboxItem[] = [];
let outboxItems: OutboxItem[] = NO_ITEMS;
const outboxListeners = new Set<() => void>();
let outboxBound = false;

function reloadOutbox() {
  void getOutbox().then((next) => {
    outboxItems = next;
    for (const listener of outboxListeners) listener();
  });
}

function subscribeOutbox(onChange: () => void) {
  outboxListeners.add(onChange);
  // Une seule lecture d'IndexedDB pour tout l'écran, quel que soit le nombre
  // de lignes qui regardent la file.
  if (!outboxBound) {
    outboxBound = true;
    window.addEventListener(OUTBOX_EVENT, reloadOutbox);
    reloadOutbox();
  }
  return () => {
    outboxListeners.delete(onChange);
  };
}

/** La file des gestes, partagée par tout l'écran, relue à chaque changement. */
export function useOutbox(): OutboxItem[] {
  return useSyncExternalStore(subscribeOutbox, () => outboxItems, () => NO_ITEMS);
}

/**
 * Le mode hors ligne de l'application, monté une fois dans le layout `(app)`.
 *
 *   1. Il GARDE LES ÉCRANS pour le hors ligne (`lib/offline/pages.ts`) :
 *      l'écran affiché, les écrans du quotidien et les fiches des commandes en
 *      cours. Sans réseau, l'application reste la même — le service worker
 *      ressert ces écrans.
 *   2. Il garde le CATALOGUE du formulaire de commande (stock, clients,
 *      réservations) : sans réseau, la saisie avertit des pièces prises.
 *   3. Il RENVOIE la file des gestes faits sans réseau (✈ / ✓, encaissements,
 *      frais, pointage, commandes provisoires) dès que le réseau revient ou
 *      que l'onglet reprend la main, puis rafraîchit l'écran.
 *   4. Il le DIT : une pastille au-dessus de la barre basse — « Hors ligne ·
 *      2 en attente », « Envoi… », « 1 refusé » — qui ouvre la liste.
 */
export function OfflineSync({ userId, locale }: { userId: string; locale: Locale }) {
  const t = useTranslations("offline");
  const router = useRouter();
  const pathname = usePathname();
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
      // Une commande envoyée a changé les réservations : catalogue relu tout de suite.
      await refreshCatalog(sent > 0);
      // Les listes que les gestes envoyés ont changées, regardées tout de suite.
      if (sent > 0) await keepPages(LISTS_AFTER_SEND.map((path) => `/${locale}${path}`), 0);
    } finally {
      setSending(false);
    }
    await keepAppPages(locale);
  }, [router, t, locale]);

  // L'écran affiché entre dans le cache — un peu après, pour ne pas gêner son
  // chargement. Navigation dans l'application : le service worker ne le voit
  // pas passer, c'est ici qu'on le lui donne.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void keepPage(window.location.pathname + window.location.search, CURRENT_MAX_AGE_MS);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    setOfflineContext({ userId, locale });
    void rememberLocale(locale);
    let last = 0;
    const run = () => {
      last = Date.now();
      void sync();
    };
    // Un autre compte sur ce téléphone : ses gestes ne partiront pas sous celui-ci.
    void dropOtherUsers(userId).then(run);

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      // La file part toujours ; les écrans, seulement s'ils ont vieilli.
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
            ? t("offline.rejectedBecause", { reason: t(item.error ?? "errors.generic", item.errorValues) })
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
