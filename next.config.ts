import { withSerwist } from "@serwist/turbopack";
import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Le Supabase dont viennent les photos du stock : le conteneur Docker en local
// (http://127.0.0.1:56321), le projet en ligne en production. Lu dans l'env,
// pour ne jamais coder en dur l'adresse d'un projet.
const supabase = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:56321");
const supabaseIsLocal = ["127.0.0.1", "localhost"].includes(supabase.hostname);

const nextConfig: NextConfig = {
  // L'identifiant de CE build, figé dans le code du navigateur : comparé à
  // `/api/version` par `UpdateNotifier` pour annoncer une mise à jour.
  env: {
    NEXT_PUBLIC_BUILD_ID:
      process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_DEPLOYMENT_ID ?? String(Date.now()),
  },
  // Étiquette les requêtes de Next avec le déploiement — c'est ce que lit la
  // « Skew Protection » de Vercel, si elle est activée sur le projet.
  deploymentId: process.env.VERCEL_DEPLOYMENT_ID,
  experimental: {
    // Le routeur garde les pages déjà vues 30 s : revenir de la fiche à la
    // liste (ou passer de Commandes à Demain) devient instantané. Chaque Server
    // Action appelle `revalidatePath`, qui vide ce cache — une modification se
    // voit donc tout de suite.
    staleTimes: { dynamic: 30, static: 180 },
  },
  images: {
    // Photos du stock servies depuis Supabase Storage.
    remotePatterns: [
      {
        protocol: supabase.protocol === "http:" ? "http" : "https",
        hostname: supabase.hostname,
        port: supabase.port,
        pathname: "/storage/v1/object/public/**",
      },
    ],
    // Next refuse par défaut d'optimiser une image venue d'une IP locale
    // (protection SSRF). Ouvert UNIQUEMENT quand Supabase est le conteneur
    // local — jamais en production.
    dangerouslyAllowLocalIP: supabaseIsLocal,
  },
};

// `withSerwist` déclare `esbuild` comme paquet serveur externe : il construit
// le service worker (`src/app/serwist/[path]/route.ts`).
export default withSerwist(withNextIntl(nextConfig));
