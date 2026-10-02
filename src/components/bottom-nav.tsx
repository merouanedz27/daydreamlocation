"use client";

import { CalendarDays, List, Plane, Receipt, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * Barre d'onglets BASSE — les cinq onglets de son AppSheet, dans le même
 * ordre : l'équipe retrouve ses gestes sans réapprendre. Voir `daydream-ui`.
 *
 *   Calendrier · Demain · Commandes · Pas rentrés · Frais
 *
 * La création de commande n'est PLUS un onglet : c'est le bouton rond flottant
 * (`NewOrderFab`), au-dessus de la barre, comme le « + » rouge d'AppSheet.
 * Le stock et le bilan passent dans le menu du compte : ce ne sont pas des
 * gestes de comptoir.
 *
 * Colonnes de largeur ÉGALE (`grid`) : un onglet qui bouge d'une page ou d'une
 * langue à l'autre se rate au pouce. Libellés COURTS (`nav.*Short`) et
 * `truncate` : à 390 px, cinq colonnes font 78 px.
 */
export function BottomNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();

  const items = [
    { href: "/commandes/calendrier", icon: CalendarDays, label: t("calendarShort") },
    { href: "/commandes/demain", icon: Plane, label: t("tomorrowShort") },
    { href: "/commandes", icon: List, label: t("ordersShort") },
    { href: "/commandes/pas-rentres", icon: Undo2, label: t("notReturnedShort") },
    { href: "/frais", icon: Receipt, label: t("fraisShort") },
  ] as const;

  /**
   * « Commandes » coiffe la liste ET les fiches (`/commandes/123`), mais pas
   * ses onglets frères : sans cette règle, `startsWith("/commandes")` allumerait
   * deux onglets à la fois sur « Demain ».
   */
  function isActive(href: string) {
    if (href === "/commandes") {
      return pathname === "/commandes" || /^\/commandes\/(\d+|nouvelle)(\/|$)/.test(pathname);
    }
    return pathname.startsWith(href);
  }

  return (
    <nav
      className="border-nav-border bg-nav supports-[backdrop-filter]:bg-nav/92 pb-safe sticky bottom-0 z-40 border-t backdrop-blur-md md:hidden"
      aria-label={t("primary")}
    >
      <div className="mx-auto grid max-w-lg grid-cols-5 items-stretch">
        {items.map(({ href, icon: Icon, label }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-h-14 flex-col items-center justify-center gap-1 px-0.5 text-[11px] transition-colors",
                active ? "text-nav-foreground font-medium" : "text-nav-muted hover:text-nav-foreground",
              )}
            >
              {/* L'onglet actif se signale par un TRAIT `gold-soft` (4,89:1
                  sur la barre), jamais par la seule couleur du libellé.
                  `inset-x` porte sur les deux côtés — rien à miroiter en RTL. */}
              {active && (
                <span className="bg-gold-soft absolute inset-x-3 top-0 h-0.5 rounded-full" aria-hidden />
              )}
              <Icon
                className={cn("size-5 shrink-0", href === "/commandes/demain" && "rtl:-scale-x-100")}
                aria-hidden
              />
              <span className="max-w-full truncate">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
