"use client";

import { ClipboardList, LayoutGrid, Plus, TrendingUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * Barre d'onglets BASSE — l'équipe travaille au pouce, sur téléphone.
 * Voir le skill `daydream-ui`.
 *
 * Le bouton central « + » est l'action la plus fréquente de la journée :
 * créer une commande. Il est mis en avant plutôt que noyé dans une liste.
 */
export function BottomNav({ showDashboard }: { showDashboard: boolean }) {
  const t = useTranslations("nav");
  const pathname = usePathname();

  const items = [
    { href: "/commandes", icon: ClipboardList, label: t("orders") },
    { href: "/stock", icon: LayoutGrid, label: t("stock") },
    ...(showDashboard
      ? [{ href: "/tableau-de-bord", icon: TrendingUp, label: t("dashboard") }]
      : []),
  ] as const;

  return (
    <nav
      className="border-border bg-cream pb-safe sticky bottom-0 z-40 border-t md:hidden"
      aria-label={t("orders")}
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around">
        {items.map(({ href, icon: Icon, label }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 px-2 text-xs transition-colors",
                active
                  ? "text-gold-strong font-medium"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </Link>
          );
        })}

        <Link
          href="/commandes/nouvelle"
          className="flex min-h-14 flex-1 flex-col items-center justify-center gap-1 px-2 text-xs"
        >
          <span className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-full">
            <Plus className="size-5" aria-hidden />
          </span>
          <span className="sr-only">{t("new")}</span>
        </Link>
      </div>
    </nav>
  );
}
