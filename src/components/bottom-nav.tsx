"use client";

import { ClipboardList, LayoutGrid, Plus, TrendingUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * Barre d'onglets BASSE — l'équipe travaille au pouce, sur téléphone.
 * Voir le skill `daydream-ui`.
 *
 * Trois décisions valent d'être expliquées :
 *
 * 1. **Le « + » est au MILIEU**, pas en bout de barre. Créer une commande est
 *    le geste le plus répété de la journée : il revient au centre, là où le
 *    pouce tombe sans déplacer la main.
 * 2. **Colonnes de largeur ÉGALE** (`grid`, pas `justify-around`) : les onglets
 *    ne bougent plus d'un écran à l'autre ni d'une langue à l'autre. Un onglet
 *    qui se déplace entre deux pages se rate au pouce.
 * 3. **Les libellés ne passent jamais à la ligne.** À 390 px, quatre colonnes
 *    font 97 px : « Tableau de bord » s'y cassait en deux lignes et poussait la
 *    barre en hauteur. La barre basse utilise donc `nav.dashboardShort`, forme
 *    courte réservée à cet usage — l'en-tête de bureau, lui, garde le nom
 *    complet. `truncate` reste en filet de sécurité pour toute traduction
 *    future plus longue que prévu.
 */
export function BottomNav({ showDashboard }: { showDashboard: boolean }) {
  const t = useTranslations("nav");
  const pathname = usePathname();

  const items = [
    { href: "/commandes", icon: ClipboardList, label: t("orders") },
    { href: "/stock", icon: LayoutGrid, label: t("stock") },
    ...(showDashboard
      ? [{ href: "/tableau-de-bord", icon: TrendingUp, label: t("dashboardShort") }]
      : []),
  ] as const;

  const tab = ({
    href,
    icon: Icon,
    label,
  }: {
    href: string;
    icon: typeof ClipboardList;
    label: string;
  }) => {
    const active = pathname.startsWith(href);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-xs transition-colors",
          active ? "text-nav-foreground font-medium" : "text-nav-muted hover:text-nav-foreground",
        )}
      >
        {/* L'onglet actif se signale par un TRAIT, jamais par un libellé
            coloré. Le trait est en `gold-soft` et NON en jaune vif : depuis
            que la barre a été éclaircie, le jaune vif n'y vaut plus que
            2,74:1 — sous le minimum de 3:1 d'un élément graphique, il se
            serait dissous dans le brun. `gold-soft` y tient 4,89:1.
            `inset-x` porte sur les deux côtés — rien à miroiter en RTL. */}
        {active && (
          <span className="bg-gold-soft absolute inset-x-3 top-0 h-0.5 rounded-full" aria-hidden />
        )}
        <Icon className="size-5 shrink-0" aria-hidden />
        <span className="max-w-full truncate">{label}</span>
      </Link>
    );
  };

  return (
    <nav
      className="border-nav-border bg-nav supports-[backdrop-filter]:bg-nav/92 pb-safe sticky bottom-0 z-40 border-t backdrop-blur-md md:hidden"
      aria-label={t("primary")}
    >
      <div
        className={cn(
          "mx-auto grid max-w-lg items-stretch",
          showDashboard ? "grid-cols-4" : "grid-cols-3",
        )}
      >
        {items.slice(0, 2).map(tab)}

        {/* Pas de libellé sous le « + » : le disque jaune est déjà le seul
            élément plein de la barre, il se désigne tout seul. Le nom reste
            dans le DOM pour les lecteurs d'écran. */}
        <Link
          href="/commandes/nouvelle"
          className="flex min-h-14 flex-col items-center justify-center px-1"
        >
          <span className="bg-primary text-primary-foreground flex size-10 items-center justify-center rounded-full">
            <Plus className="size-5" aria-hidden />
          </span>
          <span className="sr-only">{t("new")}</span>
        </Link>

        {items.slice(2).map(tab)}
      </div>
    </nav>
  );
}
