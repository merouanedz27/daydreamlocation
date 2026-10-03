import type { MetadataRoute } from "next";

/**
 * Manifeste de l'application installable, servi à `/manifest.webmanifest`.
 *
 * `start_url: "/"` : la racine redirige vers `/{langue}/commandes` (ou la
 * connexion), la langue venant du cookie `NEXT_LOCALE`. L'icône ouvre donc
 * l'application dans la langue de CHAQUE employé, sans un manifeste par langue.
 *
 * `theme_color` suit `--nav` et `viewport.themeColor` du layout : les trois
 * changent ensemble. Icônes : `scripts/gen-icons.py`.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Daydream Location",
    short_name: "Daydream Location",
    description: "Gestion des locations de costumes",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    theme_color: "#6B4F3A",
    background_color: "#FFFFFF",
    lang: "fr",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
