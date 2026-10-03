import { withSerwist } from "@serwist/turbopack";
import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
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
        protocol: "https",
        hostname: "ydhlonfforwvgpgffwqw.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

// `withSerwist` déclare `esbuild` comme paquet serveur externe : il construit
// le service worker (`src/app/serwist/[path]/route.ts`).
export default withSerwist(withNextIntl(nextConfig));
