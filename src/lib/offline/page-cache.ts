/**
 * Les ÉCRANS gardés pour le hors ligne — partagé par le service worker
 * (`src/app/sw.ts`) et l'application. Aucune API propre au navigateur ou au
 * worker : `Response` et `Headers` existent des deux côtés.
 *
 * Chaque écran ouvert avec du réseau est gardé tel que le serveur l'a rendu
 * (HTML complet). Sans réseau, le service worker le ressert : même barre du
 * haut, même barre basse, même navigation. L'écran porte l'heure à laquelle il
 * a été gardé (`x-dd-cached-at`) : le bandeau « Hors ligne » l'affiche.
 *
 * Des données d'il y a un moment, jamais présentées comme l'état de la
 * boutique à l'instant — et rien de ce qui s'écrit hors ligne n'est décidé par
 * elles : chaque geste part dans la file, la base tranche au retour du réseau.
 */

/** Le cache des écrans. Vidé à chaque nouvelle version et à la déconnexion. */
export const PAGES_CACHE = "dd-pages";

/** Heure (ISO) à laquelle l'écran a été gardé. */
export const CACHED_AT_HEADER = "x-dd-cached-at";

/**
 * La dernière langue utilisée, gardée dans le même cache : l'application
 * installée s'ouvre sur `/`, qui redirige — hors ligne, le service worker
 * renvoie vers `/{langue}/commandes`.
 */
export const LOCALE_KEY = "/__dd/locale";

/** Hors ligne, `Vary: RSC, Next-Router-State-Tree…` ne doit pas empêcher de retrouver l'écran. */
export const MATCH_OPTIONS = { ignoreVary: true } as const;

/**
 * Les écrans qu'on garde : toute l'application, sauf l'impression (rendue à
 * la demande pour un document), la connexion et la page « hors ligne »
 * elle-même. Les routes `/api` ne sont pas des écrans.
 */
export function isCacheablePage(pathname: string): boolean {
  if (!/^\/(fr|ar)(\/|$)/.test(pathname)) return false;
  return !/^\/(fr|ar)\/(imprimer|login|hors-ligne)(\/|$)/.test(pathname);
}

/** La même réponse, datée — prête à entrer dans le cache. */
export async function stampResponse(response: Response): Promise<Response> {
  const headers = new Headers(response.headers);
  headers.set(CACHED_AT_HEADER, new Date().toISOString());
  return new Response(await response.blob(), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** Une page HTML complète, gardable : ni redirection, ni erreur, ni autre chose que du HTML. */
export function isStorablePage(response: Response | undefined | null): response is Response {
  return Boolean(
    response &&
      response.status === 200 &&
      !response.redirected &&
      (response.headers.get("content-type") ?? "").includes("text/html"),
  );
}
