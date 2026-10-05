"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ChevronRight,
  Download,
  KeyRound,
  LayoutGrid,
  WashingMachine,
  LogOut,
  Store,
  TrendingUp,
  User,
  Users,
  X,
} from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ThemeChoice } from "@/components/theme-choice";
import { cn } from "@/lib/utils";

/**
 * Le menu compte SUR TÉLÉPHONE — un tiroir latéral, et non le menu déroulant
 * du bureau.
 *
 * Le menu déroulant avait des lignes de ~28 px, sous la cible de 44 px, et
 * posait « Se déconnecter » au même niveau que les pages qu'on vise tous les
 * jours. Ici :
 *
 * 1. **Le tiroir sort du côté de l'icône** (`side="right"`, lu « côté fin » par
 *    `ui/sheet.tsx`) : à droite en français, à gauche en arabe.
 * 2. **La déconnexion est seule, en bas, derrière un filet.** Un geste rare,
 *    éloigné des liens fréquents. Ton neutre et non rouge : rien n'est détruit.
 * 3. **Elle ne se fait pas ici.** Le bouton ferme le tiroir et laisse
 *    l'en-tête ouvrir SA confirmation — une seule pour le bureau et le
 *    téléphone.
 *
 * Pas le `Drawer` vaul : il anime en coordonnées physiques et ignore `dir`.
 * En arabe, il glisserait depuis le mauvais bord.
 */
export function AccountSheet({
  fullName,
  roleLabel,
  showAdmin,
  onSignOut,
  onInstall,
  triggerClassName,
}: {
  fullName: string;
  roleLabel: string;
  showAdmin: boolean;
  onSignOut: () => void;
  /** Absent quand l'application est déjà installée ou ne peut pas l'être. */
  onInstall?: () => void;
  triggerClassName?: string;
}) {
  const t = useTranslations();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Même motif que le menu du bureau : en se fermant, le tiroir rendrait le
  // focus à l'icône — et l'arracherait à la confirmation qui s'ouvre. Ref et
  // non état : `onCloseAutoFocus` est lu avant le rendu suivant.
  const openingSignOut = useRef(false);

  // Ce qui n'a pas trouvé place dans les cinq onglets de la barre basse (ceux
  // de son AppSheet) : le stock pour tous, et pour le propriétaire le bilan
  // et l'administration.
  const links = [
    { href: "/stock", icon: LayoutGrid, label: t("nav.stock") },
    { href: "/pressing", icon: WashingMachine, label: t("nav.pressing") },
    ...(showAdmin
      ? [
          { href: "/tableau-de-bord", icon: TrendingUp, label: t("nav.dashboard") },
          { href: "/equipe", icon: Users, label: t("nav.team") },
          { href: "/boutique", icon: Store, label: t("nav.shop") },
        ]
      : []),
  ];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`${t("nav.account")} — ${fullName}`}
          className={cn("size-11", triggerClassName)}
        >
          <User className="size-5" aria-hidden />
        </Button>
      </SheetTrigger>

      <SheetContent
        side="right"
        showCloseButton={false}
        className="bg-background w-[85%] gap-0 p-0 sm:max-w-sm"
        onCloseAutoFocus={(e) => {
          if (!openingSignOut.current) return;
          openingSignOut.current = false;
          e.preventDefault();
        }}
      >
        {/* --- Qui est connecté ------------------------------------------- */}
        <div className="border-border flex items-center gap-3 border-b py-4 ps-4 pe-2">
          <span
            className="bg-gold-soft text-foreground flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-medium"
            aria-hidden
          >
            {initials(fullName)}
          </span>
          <div className="min-w-0 flex-1">
            {/* Le nom est une donnée saisie : jamais traduit. */}
            <SheetTitle className="truncate">{fullName}</SheetTitle>
            <SheetDescription className="text-xs">{roleLabel}</SheetDescription>
          </div>
          <SheetClose asChild>
            <Button variant="ghost" size="icon" className="size-11 shrink-0">
              <X className="size-5" aria-hidden />
              <span className="sr-only">{t("common.close")}</span>
            </Button>
          </SheetClose>
        </div>

        {/* --- Pages hors barre basse ----------------------------------------- */}
        <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label={t("nav.account")}>
          {links.length > 0 && (
            <>
              <p className="text-muted-foreground px-3 pb-1 text-xs font-medium">
                {t("nav.more")}
              </p>
              <ul className="space-y-0.5">
                {links.map(({ href, icon: Icon, label }) => {
                  const active = pathname.startsWith(href);
                  return (
                    <li key={href}>
                      {/* `SheetClose` : taper un lien navigue ET ferme. Sans
                          lui, le tiroir resterait ouvert sur la nouvelle page. */}
                      <SheetClose asChild>
                        <Link
                          href={href}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
                            active
                              ? "bg-gold-soft text-foreground font-medium"
                              : "text-foreground hover:bg-muted",
                          )}
                        >
                          <Icon
                            className={cn(
                              "size-5 shrink-0",
                              active ? "text-gold-strong" : "text-muted-foreground",
                            )}
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1 truncate">{label}</span>
                          <ChevronRight
                            className="text-muted-foreground size-4 shrink-0 rtl:-scale-x-100"
                            aria-hidden
                          />
                        </Link>
                      </SheetClose>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {/* Pour TOUS les rôles : chacun change son propre mot de passe. */}
          <p className="text-muted-foreground px-3 pt-3 pb-1 text-xs font-medium">
            {t("nav.myAccount")}
          </p>
          <SheetClose asChild>
            <Link
              href="/mot-de-passe"
              aria-current={pathname.startsWith("/mot-de-passe") ? "page" : undefined}
              className={cn(
                "flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
                pathname.startsWith("/mot-de-passe")
                  ? "bg-gold-soft text-foreground font-medium"
                  : "text-foreground hover:bg-muted",
              )}
            >
              <KeyRound className="text-muted-foreground size-5 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{t("account.changePassword")}</span>
              <ChevronRight
                className="text-muted-foreground size-4 shrink-0 rtl:-scale-x-100"
                aria-hidden
              />
            </Link>
          </SheetClose>

          {/* Clair / sombre / auto : réglé sur CE téléphone. */}
          <p className="text-muted-foreground px-3 pt-3 pb-1 text-xs font-medium">
            {t("theme.title")}
          </p>
          <ThemeChoice className="mx-1" />

          {onInstall && (
            <>
              <p className="text-muted-foreground px-3 pt-3 pb-1 text-xs font-medium">
                {t("install.section")}
              </p>
              {/* Pour tous les rôles. Le tiroir se ferme d'abord : sur iPhone,
                  l'aide s'ouvre par-dessus la page, pas par-dessus lui. Même
                  drapeau que la déconnexion : le focus ne revient pas à
                  l'icône, il reste dans l'aide qui s'ouvre. */}
              <button
                type="button"
                onClick={() => {
                  openingSignOut.current = true;
                  setOpen(false);
                  onInstall();
                }}
                className="text-foreground hover:bg-muted flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-start text-sm transition-colors"
              >
                <Download className="text-muted-foreground size-5 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{t("install.action")}</span>
              </button>
            </>
          )}
        </nav>

        {/* --- Déconnexion, collée en bas ----------------------------------- */}
        {/* `pb-safe` sur le cadre : au-dessus de la barre d'accueil de l'iPhone. */}
        <div className="border-border pb-safe border-t">
          <div className="px-4 pt-3 pb-2">
          <Button
            type="button"
            variant="outline"
            className="h-12 w-full justify-start gap-3 text-base"
            onClick={() => {
              openingSignOut.current = true;
              setOpen(false);
              onSignOut();
            }}
          >
            <LogOut className="size-5 rtl:-scale-x-100" aria-hidden />
            {t("auth.signOut")}
          </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * « Abdelatif Reziga » → « AR ». `Array.from` et non `[0]` : un caractère
 * hors plan de base (certains signes arabes composés, émojis) tient sur deux
 * unités UTF-16, et `[0]` n'en rendrait que la moitié.
 */
function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? "")
    .join("")
    .toUpperCase();
}
