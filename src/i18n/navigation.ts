import { createNavigation } from "next-intl/navigation";
import { routing, type Locale } from "./routing";

/**
 * Toujours importer Link / redirect / useRouter DEPUIS CE FICHIER,
 * jamais depuis `next/link` ou `next/navigation` : ces versions
 * conservent la locale courante dans l'URL.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);

/**
 * `redirect` typé `never`.
 *
 * Le `redirect` de next-intl n'est pas déclaré `never` (contrairement à celui
 * de `next/navigation`). TypeScript ne sait donc pas qu'il interrompt le flot,
 * et considère qu'une variable testée juste avant peut encore être `null`
 * après l'appel.
 *
 * `redirect` lève en réalité `NEXT_REDIRECT` : le `throw` ci-dessous n'est
 * jamais atteint, il ne sert qu'à donner le bon type.
 */
export function redirectTo(href: string, locale: Locale): never {
  redirect({ href, locale });
  throw new Error("unreachable");
}
