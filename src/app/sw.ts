/// <reference lib="esnext" />
/// <reference lib="webworker" />
import type { PrecacheEntry, RouteHandlerCallbackOptions, SerwistGlobalConfig } from "serwist";
import { CacheFirst, ExpirationPlugin, NetworkFirst, NetworkOnly, Serwist } from "serwist";
import {
  isCacheablePage,
  isStorablePage,
  LOCALE_KEY,
  MATCH_OPTIONS,
  PAGES_CACHE,
  stampResponse,
} from "../lib/offline/page-cache";

/**
 * Service worker de l'application installée.
 *
 * CE QU'IL GARDE
 *   - la coquille : les fichiers de `/_next/static` (JS, CSS, polices, logo,
 *     tous nommés par leur empreinte) ;
 *   - LES ÉCRANS DE L'APPLICATION (HTML complet), chacun la dernière fois
 *     qu'il a été ouvert avec du réseau. Réseau d'abord, toujours : en ligne,
 *     l'écran est frais. Sans réseau, le dernier gardé revient — même barre du
 *     haut, même barre basse, même navigation — et le bandeau « Hors ligne »
 *     dit de quand il date (`page-cache.ts`).
 *
 * Un écran périmé ne peut pas faire louer deux fois la même pièce : rien de ce
 * qui s'écrit hors ligne n'est décidé par lui. Chaque geste part dans la file
 * (`lib/offline/outbox.ts`), et la base tranche au retour du réseau.
 *
 * Les écrans gardés contiennent des noms et des téléphones de clients : ils
 * s'effacent à la déconnexion, et à chaque nouvelle version de l'application
 * (leur HTML vise les fichiers de l'ancienne).
 *
 * Seul le HTML d'une navigation COMPLÈTE est gardé, jamais une réponse RSC :
 * celle-ci ne contient que ce qui diffère de l'écran d'où l'on vient, la
 * resservir depuis un autre écran le casserait. Sans réseau, Next.js retombe
 * de lui-même sur une navigation complète quand sa requête RSC échoue — et
 * c'est ce HTML-là qui répond.
 *
 * Tout le reste passe au réseau sans intermédiaire : requêtes RSC, Server
 * Actions, export Excel, Supabase, `/_next/image`.
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

/** Les adresses de départ : elles redirigent vers `/{langue}/commandes`. */
const ROOTS = new Set(["/", "/fr", "/fr/", "/ar", "/ar/"]);

/**
 * `/` (l'application installée s'ouvre là) : réseau d'abord. Sans réseau, la
 * redirection du serveur n'arrive pas — on la fait ici, vers la liste des
 * commandes de la dernière langue utilisée, que le cache des écrans ressert.
 */
async function openRoot({ request, event }: RouteHandlerCallbackOptions): Promise<Response> {
  try {
    const preloaded = await (event as FetchEvent).preloadResponse;
    return (preloaded as Response | undefined) ?? (await fetch(request));
  } catch {
    const pathLocale = /^\/(fr|ar)/.exec(new URL(request.url).pathname)?.[1];
    const stored = await (await caches.open(PAGES_CACHE)).match(LOCALE_KEY);
    const locale = pathLocale ?? (stored ? await stored.text() : "fr");
    const target = `/${locale === "ar" ? "ar" : "fr"}/commandes`;
    return Response.redirect(new URL(target, self.location.origin).href, 302);
  }
}

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
      matcher: ({ request, sameOrigin, url }) =>
        sameOrigin && request.mode === "navigate" && ROOTS.has(url.pathname),
      handler: openRoot,
    },
    {
      // Les écrans de l'application : réseau d'abord, le dernier gardé sans
      // réseau. 8 s d'attente au plus : sur un réseau qui ne répond plus
      // (« une barre »), l'écran gardé vaut mieux qu'une page blanche.
      matcher: ({ request, sameOrigin, url }) =>
        sameOrigin && request.mode === "navigate" && isCacheablePage(url.pathname),
      handler: new NetworkFirst({
        cacheName: PAGES_CACHE,
        networkTimeoutSeconds: 8,
        matchOptions: MATCH_OPTIONS,
        plugins: [
          {
            // Seule une page HTML complète entre, datée de l'instant.
            cacheWillUpdate: async ({ response }) =>
              isStorablePage(response) ? stampResponse(response) : null,
          },
          new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 14 * 24 * 60 * 60 }),
        ],
      }),
    },
    {
      // Le reste (impression, connexion…) : réseau uniquement. Une navigation
      // échouée reçoit la petite page « hors ligne » ci-dessous.
      matcher: ({ request }) => request.mode === "navigate",
      handler: new NetworkOnly(),
    },
  ],
  fallbacks: {
    // Un écran jamais ouvert sur ce téléphone, sans réseau : la petite page
    // « hors ligne », dans la langue demandée.
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

// Nouvelle version de l'application : les écrans gardés visent les fichiers
// de l'ancienne — on les jette. L'application les regarnit dès son ouverture.
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.delete(PAGES_CACHE));
});

serwist.addEventListeners();
