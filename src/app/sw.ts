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
};

self.addEventListener("push", (event) => {
  const message = (event.data?.json() ?? {}) as PushMessage;
  event.waitUntil(
    self.registration.showNotification(message.title ?? "DayDream Location", {
      body: message.body,
      icon: "/icons/suit-192.png",
      badge: "/icons/suit-192.png",
      tag: message.tag,
      data: { url: message.url ?? "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(
    (event.notification.data as { url?: string } | undefined)?.url ?? "/",
    self.location.origin,
  ).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => "focus" in client) as WindowClient | undefined;
      if (existing) return existing.navigate(url).then((client) => client?.focus());
      return self.clients.openWindow(url);
    }),
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
