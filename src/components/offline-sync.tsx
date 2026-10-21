"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { WifiOff } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import {
  dropOtherUsers,
  flushOutbox,
  getOutbox,
  OUTBOX_EVENT,
  refreshCatalog,
  removeOutboxItem,
  reopenOrder,
  setOfflineContext,
} from "@/lib/offline/outbox";
import { forgetOtherVersions, keepPage, keepPages, rememberLocale } from "@/lib/offline/pages";
import type { OutboxItem } from "@/lib/offline/types";
import type { Locale } from "@/i18n/routing";

/** La version de CE code, figée au build (`next.config.ts`). */
const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID;

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

/**
 * Le SEUL signe du hors ligne : une petite pastille rouge dans la barre du
 * haut, à côté du logo. Rien ne s'affiche en ligne. L'icône porte le sens
 * (jamais la couleur seule), le nom accessible le dit en toutes lettres.
 */
export function OfflineBadge() {
  const t = useTranslations("offline");
  const online = useOnline();
  if (online) return null;
  return (
    <span
      role="status"
      title={t("badge")}
      className="bg-destructive text-destructive-foreground flex size-6 shrink-0 items-center justify-center rounded-full"
    >
      <WifiOff className="size-3.5" aria-hidden />
      <span className="sr-only">{t("badge")}</span>
    </span>
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
 * Il ne montre RIEN — la pastille de la barre du haut suffit à dire qu'on est
 * hors ligne. En coulisse :
 *
 *   1. il GARDE LES ÉCRANS pour le hors ligne (`lib/offline/pages.ts`) :
 *      l'écran affiché, les écrans du quotidien et les fiches des commandes en
 *      cours — sans réseau, l'application reste la même ;
 *   2. il garde le CATALOGUE du formulaire de commande (stock, clients,
 *      réservations) : sans réseau, la saisie grise les pièces prises ;
 *   3. il ENVOIE la file des gestes faits sans réseau (✈ / ✓, encaissements,
 *      frais, pointage, commandes) dès que le réseau revient, puis rafraîchit
 *      l'écran.
 *
 * Seul un REFUS de la base se dit, par un message : un geste perdu en silence
 * serait pire que du bruit. Une commande refusée (pièce déjà louée) propose
 * « Corriger » — la saisie revient dans le formulaire — ou « Abandonner » ;
 * tant qu'on n'a pas choisi, le message revient à chaque ouverture.
 */
export function OfflineSync({ userId, locale }: { userId: string; locale: Locale }) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  /** Les refus déjà annoncés pendant cette visite : pas deux fois le même. */
  const announced = useRef(new Set<string>());

  const announce = useCallback(
    (item: OutboxItem) => {
      if (announced.current.has(item.id)) return;
      announced.current.add(item.id);
      const message = t("offline.rejectedToast", {
        title: item.title,
        reason: t(item.error ?? "errors.generic", item.errorValues),
      });
      const isOrder = item.op.kind === "order" || item.op.kind === "orderEdit";
      if (!isOrder) {
        // Un ✈, un frais, un pointage refusé : dit une fois, puis oublié.
        toast.error(message, { duration: 15_000 });
        void removeOutboxItem(item.id);
        return;
      }
      toast.error(message, {
        duration: Infinity,
        action: {
          label: t("offline.fix"),
          onClick: () => {
            void reopenOrder(item, locale).then((opened) => {
              if (!opened) toast.error(t("offline.finishCurrentDraft"));
            });
          },
        },
        cancel: {
          label: t("offline.dropOrder"),
          onClick: () => void removeOutboxItem(item.id),
        },
      });
    },
    [t, locale],
  );

  /** Envoie la file ; un refus se dit, un envoi rafraîchit l'écran. */
  const flush = useCallback(async () => {
    const { sent, rejected } = await flushOutbox();
    if (sent > 0) router.refresh();
    for (const item of rejected) announce(item);
    return sent;
  }, [router, announce]);

  const sync = useCallback(async () => {
    if (!navigator.onLine) return;
    const sent = await flush();
    // Une commande envoyée a changé les réservations : catalogue relu tout de suite.
    await refreshCatalog(sent > 0);
    // Les listes que les gestes envoyés ont changées, regardées tout de suite.
    if (sent > 0) await keepPages(LISTS_AFTER_SEND.map((path) => `/${locale}${path}`), 0);
    await keepAppPages(locale);
  }, [flush, locale]);

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
    let last = 0;
    const run = () => {
      last = Date.now();
      void sync();
    };
    // D'abord : les écrans gardés par une autre version de l'application s'en
    // vont (ils montreraient, hors ligne, ce qui n'existe plus). Puis un autre
    // compte sur ce téléphone : ses gestes ne partiront pas sous celui-ci.
    // Enfin les commandes refusées d'une visite précédente, encore en attente
    // d'une décision.
    void forgetOtherVersions(BUILD_ID)
      .then(() => rememberLocale(locale))
      .then(() => dropOtherUsers(userId))
      .then(getOutbox)
      .then((items) => {
        for (const item of items) {
          if (item.status === "rejected" && item.userId === userId) announce(item);
        }
        run();
      });

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      // La file part toujours ; les écrans, seulement s'ils ont vieilli.
      if (Date.now() - last > REFRESH_MS) run();
      else void flush();
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
  }, [userId, locale, sync, flush, announce]);

  return null;
}
