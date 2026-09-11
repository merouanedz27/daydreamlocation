"use client";

import {
  ClipboardList,
  LayoutGrid,
  LogOut,
  Receipt,
  TrendingUp,
  User,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { Link, usePathname } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { signOut } from "@/lib/actions/auth";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/routing";

export function AppHeader({
  fullName,
  roleLabel,
  showDashboard,
}: {
  fullName: string;
  roleLabel: string;
  showDashboard: boolean;
}) {
  const t = useTranslations();
  const pathname = usePathname();
  const { locale } = useParams<{ locale: Locale }>();

  // Navigation horizontale sur desktop uniquement : sur téléphone c'est la
  // barre basse qui sert (zone du pouce). Voir `daydream-ui`.
  const items = [
    { href: "/commandes", icon: ClipboardList, label: t("nav.orders") },
    { href: "/stock", icon: LayoutGrid, label: t("nav.stock") },
    // Dépenses n'entre PAS dans la barre basse : elle porte déjà quatre
    // cibles, et une cinquième casserait les 44 px à 390 px de large. Sur
    // téléphone on y accède par le menu compte et le tableau de bord.
    ...(showDashboard
      ? [
          { href: "/tableau-de-bord", icon: TrendingUp, label: t("nav.dashboard") },
          { href: "/depenses", icon: Receipt, label: t("nav.expenses") },
        ]
      : []),
  ] as const;

  return (
    /* Barre BRUNE, translucide et floutée : le contenu défile visiblement
       dessous, ce qui rattache la barre à la page au lieu de la poser
       par-dessus.
       92 % et non 85 % comme du temps du crème — une barre sombre inverse le
       risque : ce qui la menace n'est plus un aplat sombre qui passerait
       dessous, mais le fond BLANC de la page, donc le cas ordinaire. Mesures
       du pire cas dans `globals.css`.
       `bg-nav` opaque reste le repli : sans `backdrop-filter`, une barre
       translucide laisserait le texte de la page traverser le sien.
       Toutes les couleurs de texte sont REPOSÉES ici : celles de la page
       (`muted-foreground` en tête) tombent à 1,09:1 sur ce brun.
       (Ce n'est pas du « glassmorphism » : pas de halo, pas d'ombre, le filet
       de bordure fait toujours la séparation. Voir `daydream-ui`.) */
    <header className="border-nav-border bg-nav supports-[backdrop-filter]:bg-nav/92 text-nav-foreground sticky top-0 z-40 border-b backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
        <Link href="/commandes" className="font-heading shrink-0 text-lg">
          {t("app.name")}
        </Link>

        <nav className="ms-4 hidden items-center gap-1 md:flex">
          {items.map(({ href, icon: Icon, label }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-10 items-center gap-2 rounded-md px-3 text-sm transition-colors",
                  active
                    // Pastille or clair sur le brun : 5,67:1 contre la barre,
                    // et l'encre dessus 14,65:1. L'onglet actif se voit de
                    // loin, sans recourir au jaune vif qui, en TEXTE sur ce
                    // brun, ne vaut que 3,17:1.
                    ? "bg-gold-soft text-foreground font-medium"
                    // Le survol éclaircit le FOND ET le texte : à 8 % de voile
                    // blanc, le beige seul repasserait sous 4,5:1.
                    : "text-nav-muted hover:bg-nav-foreground/8 hover:text-nav-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="ms-auto flex items-center gap-2">
          {/* Le commutateur sert aussi la page de connexion, sur fond
              blanc : ses couleurs de barre lui sont passées d'ici. */}
          <LocaleSwitcher className="border-nav-border bg-nav-foreground/10 text-nav-foreground hover:bg-nav-foreground/20" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-nav-muted hover:bg-nav-foreground/8 hover:text-nav-foreground size-10"
              >
                <User className="size-5" aria-hidden />
                <span className="sr-only">{fullName}</span>
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <span className="block">{fullName}</span>
                <span className="text-muted-foreground text-xs font-normal">
                  {roleLabel}
                </span>
              </DropdownMenuLabel>

              <DropdownMenuSeparator />

              {showDashboard && (
                <>
                  <DropdownMenuItem asChild className="md:hidden">
                    <Link href="/depenses">
                      <Receipt className="size-4" aria-hidden />
                      {t("nav.expenses")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="md:hidden" />
                </>
              )}

              <form action={signOut}>
                <input type="hidden" name="locale" value={locale} />
                <DropdownMenuItem asChild>
                  <button type="submit" className="w-full">
                    <LogOut className="size-4" aria-hidden />
                    {t("auth.signOut")}
                  </button>
                </DropdownMenuItem>
              </form>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
