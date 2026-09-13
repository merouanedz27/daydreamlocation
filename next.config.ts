import { withSerwist } from "@serwist/turbopack";
import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
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
