import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/**
 * Toujours importer Link / redirect / useRouter DEPUIS CE FICHIER,
 * jamais depuis `next/link` ou `next/navigation` : ces versions
 * conservent la locale courante dans l'URL.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
