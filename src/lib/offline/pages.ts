/**
 * Garder les écrans pour le hors ligne — côté application (navigateur).
 *
 * Le service worker garde déjà chaque écran ouvert par une navigation
 * COMPLÈTE. Mais dans l'application, on passe d'un écran à l'autre sans
 * recharger : ces écrans-là, il ne les voit jamais passer. On les lui donne
 * ici, dans le même cache (`PAGES_CACHE`) :
 *   - l'écran affiché, à chaque changement d'écran ;
 *   - les écrans du quotidien (listes, saisie, pointage, frais…) et les
 *     commandes de demain et des tenues sorties, régulièrement.
 *
 * Un écran gardé depuis moins de `maxAgeMs` n'est pas redemandé : le serveur
 * ne rend pas deux fois la même page pour rien.
 */
import {
  CACHED_AT_HEADER,
  isCacheablePage,
  isStorablePage,
  LOCALE_KEY,
  MATCH_OPTIONS,
  PAGES_CACHE,
  stampResponse,
} from "@/lib/offline/page-cache";

function available(): boolean {
  return typeof caches !== "undefined";
}

/** « /fr/commandes?q=x » — la clé d'un écran dans le cache. */
function keyOf(url: string): string {
  const u = new URL(url, window.location.origin);
  return u.pathname + u.search;
}

/** Quand cet écran a été gardé (ISO), ou `null`. */
export async function pageCachedAt(url: string): Promise<string | null> {
  if (!available()) return null;
  try {
    const cache = await caches.open(PAGES_CACHE);
    const response = await cache.match(keyOf(url), MATCH_OPTIONS);
    return response?.headers.get(CACHED_AT_HEADER) ?? null;
  } catch {
    return null;
  }
}

/** Garde un écran s'il manque, ou s'il a plus de `maxAgeMs`. Silencieux en cas d'échec. */
export async function keepPage(url: string, maxAgeMs: number): Promise<void> {
  if (!available() || !navigator.onLine) return;
  const key = keyOf(url);
  if (!isCacheablePage(new URL(key, window.location.origin).pathname)) return;
  const at = await pageCachedAt(key);
  if (at && Date.now() - Date.parse(at) < maxAgeMs) return;
  try {
    const response = await fetch(key, {
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "text/html" },
    });
    // Une redirection (écran réservé à l'administrateur, session expirée)
    // n'est pas un écran à garder.
    if (!isStorablePage(response)) return;
    const cache = await caches.open(PAGES_CACHE);
    await cache.put(key, await stampResponse(response));
  } catch {
    /* hors ligne entre-temps : l'ancien écran reste */
  }
}

/** L'un après l'autre : jamais une rafale de rendus serveur. */
export async function keepPages(urls: string[], maxAgeMs: number): Promise<void> {
  for (const url of urls) {
    if (!navigator.onLine) return;
    await keepPage(url, maxAgeMs);
  }
}

/** La langue de l'application, pour rouvrir `/` sans réseau sur la bonne liste. */
export async function rememberLocale(locale: string): Promise<void> {
  if (!available()) return;
  try {
    const cache = await caches.open(PAGES_CACHE);
    await cache.put(LOCALE_KEY, new Response(locale, { headers: { "Content-Type": "text/plain" } }));
  } catch {
    /* rien de grave : `fr` par défaut */
  }
}

/** Déconnexion : les écrans gardés portent des noms et des téléphones de clients. */
export async function clearPages(): Promise<void> {
  if (!available()) return;
  try {
    await caches.delete(PAGES_CACHE);
  } catch {
    /* rien à effacer */
  }
}
