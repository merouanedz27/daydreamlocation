"use client";

import { ClipboardList, LayoutGrid, LogOut, TrendingUp, User } from "lucide-react";
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
    ...(showDashboard
      ? [{ href: "/tableau-de-bord", icon: TrendingUp, label: t("nav.dashboard") }]
      : []),
  ] as const;

  return (
    <header className="border-border bg-card sticky top-0 z-40 border-b">
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
