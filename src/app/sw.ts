/// <reference lib="esnext" />
/// <reference lib="webworker" />
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, NetworkOnly, Serwist } from "serwist";

/**
 * Service worker de l'application installée.
 *
 * CE QU'IL GARDE — la coquille, et rien d'autre : les fichiers de
 * `/_next/static` (JS, CSS, polices, logo, tous nommés par leur empreinte) et
 * les deux pages « hors ligne ». Aucune page de données n'entre dans un cache :
 * une disponibilité périmée laisserait deux employés louer la même pièce, et
 * les téléphones des clients n'ont rien à faire sur l'appareil.
 *
 * C'est pourquoi on n'utilise PAS `defaultCache` de Serwist : il met en cache
 * les pages HTML et les réponses RSC, c'est-à-dire des commandes et des clients.
 *
 * Tout ce qui n'est pas listé ci-dessous passe au réseau sans intermédiaire :
 * requêtes RSC, Server Actions, export Excel, Supabase, `/_next/image`.
 *
 * Types à part (`tsconfig.sw.json`) : la lib `webworker` entre en conflit avec
 * `dom` dans le tsconfig principal.
 */

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

type PushMessage = {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
  /** Non-lues du destinataire, pour l'icône de l'app installée. */
  badge?: number;
};

function readPush(event: PushEvent): PushMessage {
  try {
    return (event.data?.json() ?? {}) as PushMessage;
  } catch {
    // Un message non JSON s'affiche tel quel plutôt que de se perdre.
    return { body: event.data?.text() };
  }
}

self.addEventListener("push", (event) => {
  const message = readPush(event);
  const badge =
    typeof message.badge === "number" && "setAppBadge" in self.navigator
      ? self.navigator.setAppBadge(message.badge).catch(() => {})
      : Promise.resolve();
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(message.title ?? "DayDream Location", {
        body: message.body,
        icon: "/icons/suit-192.png",
        // Barre d'état Android : seule la transparence compte. Une icône
        // opaque y devient un carré blanc — d'où cette silhouette blanche.
        badge: "/icons/badge-96.png",
        tag: message.tag,
        data: { url: message.url ?? "/" },
      }),
      badge,
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = (event.notification.data as { url?: string } | undefined)?.url ?? "/";
  const target = new URL(raw, self.location.origin);
  // Jamais hors de l'application, quoi que contienne le message.
  const url = target.origin === self.location.origin ? target.href : self.location.origin;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = windows[0] as WindowClient | undefined;
      if (existing) {
        try {
          // `navigate` échoue sur une fenêtre que ce service worker ne contrôle
          // pas encore : on retombe alors sur une nouvelle fenêtre.
          const focused = await existing.focus();
          await focused.navigate(url);
          return;
        } catch {
          /* ouverture ci-dessous */
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: ({ sameOrigin, url }) => sameOrigin && url.pathname.startsWith("/_next/static/"),
      handler: new CacheFirst({ cacheName: "next-static" }),
    },
    {
      // Réseau uniquement. La route n'existe que pour qu'une navigation
      // échouée (pas de réseau) reçoive la page « hors ligne » ci-dessous.
      matcher: ({ request }) => request.mode === "navigate",
      handler: new NetworkOnly(),
    },
  ],
  fallbacks: {
    // Dans la langue de la page demandée.
    entries: [
      {
        url: "/ar/hors-ligne",
        matcher: ({ request }) =>
          request.destination === "document" && new URL(request.url).pathname.startsWith("/ar"),
      },
      {
        url: "/fr/hors-ligne",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();
