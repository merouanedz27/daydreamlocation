import { createSerwistRoute } from "@serwist/turbopack";

/**
 * Sert le service worker à `/serwist/sw.js` — le point dans le chemin le fait
 * échapper au proxy next-intl. La réponse porte `Service-Worker-Allowed: /` :
 * le worker contrôle donc tout le site malgré son dossier.
 *
 * Révision des pages « hors ligne » : le commit déployé sur Vercel. Hors
 * Vercel, une valeur aléatoire force leur remise en cache à chaque build.
 */
const revision = process.env.VERCEL_GIT_COMMIT_SHA ?? crypto.randomUUID();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  swSrc: "src/app/sw.ts",
  // Paquet `esbuild` natif, installé en devDependency : plus rapide que la
  // version wasm, qui serait sinon utilisée sur Linux (Vercel).
  useNativeEsbuild: true,
  additionalPrecacheEntries: [
    { url: "/fr/hors-ligne", revision },
    { url: "/ar/hors-ligne", revision },
    // Saisie et modification de commande sans réseau (commandes provisoires).
    { url: "/fr/hors-ligne/nouvelle", revision },
    { url: "/ar/hors-ligne/nouvelle", revision },
    { url: "/fr/hors-ligne/modifier", revision },
    { url: "/ar/hors-ligne/modifier", revision },
  ],
});
