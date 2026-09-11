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
    /* Barre TRANSLUCIDE ET FLOUTÉE : le contenu défile visiblement dessous,
       ce qui rattache la barre à la page au lieu de la poser par-dessus.
       85 % de crème, MESURÉ, pas choisi à l'œil : c'est le seuil où le texte
       secondaire (`muted-foreground`) tient encore 4,72:1 même si un aplat
       d'encre passait dessous. À 80 % il tombe à 4,25:1 — sous la norme.
       `bg-cream` opaque reste le repli : sans `backdrop-filter`, une barre
       translucide laisserait le texte de la page traverser le sien.
       (Ce n'est pas du « glassmorphism » : pas de halo, pas d'ombre, le filet
       de bordure fait toujours la séparation. Voir `daydream-ui`.) */
    <header className="border-border bg-cream supports-[backdrop-filter]:bg-cream/85 sticky top-0 z-40 border-b backdrop-blur-md">
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
                    ? "bg-accent text-foreground font-medium"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="ms-auto flex items-center gap-2">
          <LocaleSwitcher />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-10">
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
