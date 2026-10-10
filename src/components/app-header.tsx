"use client";

import {
  CalendarDays,
  ClipboardList,
  Download,
  KeyRound,
  LayoutGrid,
  WashingMachine,
  LogOut,
  Plane,
  Receipt,
  Store,
  TrendingUp,
  Undo2,
  User,
  Users,
} from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { Link, usePathname } from "@/i18n/navigation";
import { AccountSheet } from "@/components/account-sheet";
import { HeaderSearch } from "@/components/header-search";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { InstallHelpDrawer, useInstallApp } from "@/components/install-app";
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
import { ThemeChoice } from "@/components/theme-choice";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/routing";
import wordmark from "../../public/logo-wordmark.png";

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
  const [signOutOpen, setSignOutOpen] = useState(false);
  // Drapeau SYNCHRONE : il est lu par `onCloseAutoFocus` du menu, qui se
  // déclenche avant que React n'ait rendu le nouvel état. Un `useState` y
  // renverrait encore `false`.
  const openingSignOut = useRef(false);
  const installApp = useInstallApp();

  // Navigation horizontale sur desktop uniquement : sur téléphone c'est la
  // barre basse qui sert (zone du pouce). Voir `daydream-ui`.
  //
  // Les CINQ onglets de la barre basse — ceux de son AppSheet — et rien de
  // plus. L'en-tête est borné à la largeur de la page (1024 px) : avec le
  // stock, le bilan et les dépenses en plus, il débordait et affichait une
  // barre de défilement même sur grand écran. Ces pages passent dans le menu
  // du compte, comme sur téléphone.
  const items = [
    { href: "/commandes/calendrier", icon: CalendarDays, label: t("nav.calendarShort") },
    { href: "/commandes/demain", icon: Plane, label: t("nav.tomorrowShort") },
    { href: "/commandes", icon: ClipboardList, label: t("nav.orders") },
    { href: "/commandes/pas-rentres", icon: Undo2, label: t("nav.notReturnedShort") },
    { href: "/frais", icon: Receipt, label: t("nav.fraisShort") },
  ] as const;

  /** Pages hors onglets, rangées dans le menu du compte. */
  const moreLinks = [
    { href: "/stock", icon: LayoutGrid, label: t("nav.stock") },
    { href: "/pressing", icon: WashingMachine, label: t("nav.pressing") },
    ...(showDashboard
      ? [
          { href: "/tableau-de-bord", icon: TrendingUp, label: t("nav.dashboard") },
        ]
      : []),
  ];

  /** Même règle que la barre basse : « Commandes » n'allume pas ses onglets frères. */
  function isActive(href: string) {
    if (href === "/commandes") {
      return pathname === "/commandes" || /^\/commandes\/(\d+|nouvelle)(\/|$)/.test(pathname);
    }
    return pathname.startsWith(href);
  }

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
      <div className="relative mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
        {/* LE LOGO DU BON — « DAYDREAM · LOCATION », celui du modèle Word du
            propriétaire, pour que l'écran et le papier portent la même marque.
            Le fichier est en encre noire sur transparent : `brightness-0
            invert` le passe en BLANC, lisible sur le brun de la barre. Pas de
            second fichier à tenir à jour.

            Le `alt` n'est pas décoratif : plus aucun texte n'accompagne le
            logo, il est donc le SEUL nom accessible de ce lien. */}
        <Link href="/commandes" className="flex shrink-0 items-center">
          <Image
            src={wordmark}
            alt={t("app.name")}
            priority
            sizes="140px"
            className="h-5 w-auto brightness-0 invert sm:h-6"
          />
        </Link>

        {/* Pas de défilement : les cinq onglets tiennent toujours. Entre 768
            et 1024 px, icônes seules (le nom reste en infobulle et pour les
            lecteurs d'écran) ; au-delà, icône et nom. */}
        <nav className="ms-2 hidden shrink-0 items-center gap-0.5 md:flex lg:ms-4">
          {items.map(({ href, icon: Icon, label }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                title={label}
                className={cn(
                  "press flex min-h-10 min-w-10 shrink-0 items-center justify-center gap-2 rounded-md px-2.5 text-sm whitespace-nowrap",
                  active
                    ? // Pastille or clair sur le brun : 5,67:1 contre la barre,
                      // et l'encre dessus 14,65:1. L'onglet actif se voit de
                      // loin, sans recourir au jaune vif qui, en TEXTE sur ce
                      // brun, ne vaut que 3,17:1.
                      "bg-gold-soft text-foreground font-medium"
                    : // Le survol éclaircit le FOND ET le texte : à 8 % de voile
                      // blanc, le beige seul repasserait sous 4,5:1.
                      "text-nav-muted hover:bg-nav-foreground/8 hover:text-nav-foreground",
                )}
              >
                <Icon
                  className={cn("size-4 shrink-0", href === "/commandes/demain" && "rtl:-scale-x-100")}
                  aria-hidden
                />
                <span className="sr-only lg:not-sr-only">{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Remontée à chaque page : elle repart du `?q=` de la nouvelle URL. */}
        <HeaderSearch key={pathname} />

        <div className="flex shrink-0 items-center gap-2">
          {/* Le commutateur sert aussi la page de connexion, sur fond
              blanc : ses couleurs de barre lui sont passées d'ici. */}
          <LocaleSwitcher className="border-nav-border bg-nav-foreground/10 text-nav-foreground hover:bg-nav-foreground/20" />

          {/* Téléphone : tiroir latéral. Bureau : le menu déroulant ci-dessous.
              Les deux ouvrent la MÊME confirmation de déconnexion. */}
          <AccountSheet
            fullName={fullName}
            roleLabel={roleLabel}
            showAdmin={showDashboard}
            onSignOut={() => setSignOutOpen(true)}
            onInstall={installApp.available ? installApp.install : undefined}
            triggerClassName="text-nav-muted hover:bg-nav-foreground/8 hover:text-nav-foreground active:bg-nav-foreground/15 md:hidden"
          />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-nav-muted hover:bg-nav-foreground/8 hover:text-nav-foreground active:bg-nav-foreground/15 hidden size-10 md:inline-flex"
              >
                <User className="size-5" aria-hidden />
                <span className="sr-only">{fullName}</span>
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
              align="end"
              className="w-56"
              // Le menu rend normalement le focus à son bouton en se fermant.
              // Quand il se ferme POUR ouvrir la confirmation, ce retour
              // arracherait le focus au tiroir qui vient de s'ouvrir. On ne le
              // neutralise que dans ce cas : sur une fermeture ordinaire
              // (Échap, clic dehors), le focus doit revenir au déclencheur.
              onCloseAutoFocus={(e) => {
                if (!openingSignOut.current) return;
                openingSignOut.current = false;
                e.preventDefault();
              }}
            >
              <DropdownMenuLabel>
                <span className="block">{fullName}</span>
                <span className="text-muted-foreground text-xs font-normal">
                  {roleLabel}
                </span>
              </DropdownMenuLabel>

              <DropdownMenuSeparator />

              {moreLinks.map(({ href, icon: Icon, label }) => (
                <DropdownMenuItem key={href} asChild>
                  <Link href={href}>
                    <Icon className="size-4" aria-hidden />
                    {label}
                  </Link>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />

              {showDashboard && (
                <>
                  {/* L'équipe et la boutique : des gestes rares, réservés au
                      propriétaire. */}
                  <DropdownMenuItem asChild>
                    <Link href="/equipe">
                      <Users className="size-4" aria-hidden />
                      {t("nav.team")}
                    </Link>
                  </DropdownMenuItem>

                  {/* Adresse, téléphone et conditions du bon de location : un
                      réglage qu'on écrit une fois, rangé à côté de l'équipe. */}
                  <DropdownMenuItem asChild>
                    <Link href="/boutique">
                      <Store className="size-4" aria-hidden />
                      {t("nav.shop")}
                    </Link>
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />
                </>
              )}

              <DropdownMenuItem asChild>
                <Link href="/mot-de-passe">
                  <KeyRound className="size-4" aria-hidden />
                  {t("account.profileTitle")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-muted-foreground text-xs font-medium">
                {t("theme.title")}
              </DropdownMenuLabel>
              <ThemeChoice compact className="mx-1 mb-1" />
              <DropdownMenuSeparator />

              {/* Visible pour TOUS les rôles : chaque employé installe
                  l'application sur son propre téléphone. */}
              {installApp.available && (
                <>
                  <DropdownMenuItem onSelect={() => installApp.install()}>
                    <Download className="size-4" aria-hidden />
                    {t("install.action")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}

              {/* Le tiroir de confirmation ne peut pas vivre DANS le menu :
                  le menu se démonte en se fermant, et emporterait le tiroir
                  avec lui. L'élément ne fait donc qu'armer l'état. */}
              <DropdownMenuItem
                onSelect={() => {
                  openingSignOut.current = true;
                  setSignOutOpen(true);
                }}
              >
                <LogOut className="size-4" aria-hidden />
                {t("auth.signOut")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Hors du menu et du tiroir compte, pour la même raison que la
          confirmation ci-dessous : ils se démontent en se fermant. */}
      <InstallHelpDrawer open={installApp.helpOpen} onOpenChange={installApp.setHelpOpen} />

      {/* POURQUOI CONFIRMER UNE DÉCONNEXION, QUI NE DÉTRUIT RIEN
          Parce qu'ici elle ne se rattrape pas toute seule : il n'y a pas
          d'inscription publique, les comptes sont créés par le patron, et
          l'équipe travaille sur des téléphones où le mot de passe n'est pas
          toujours connu de celui qui tient l'appareil. Se déconnecter d'un
          pouce en visant l'icône voisine peut donc arrêter le travail jusqu'à
          ce que le patron soit joignable.
          Ton NEUTRE et non rouge : on se reconnecte, rien n'est perdu. Le
          rouge est réservé à ce qui efface. */}
      <ConfirmDialog
        open={signOutOpen}
        onOpenChange={setSignOutOpen}
        tone="default"
        icon={<LogOut className="size-4" />}
        title={t("auth.signOutConfirmTitle")}
        description={t("auth.signOutConfirmBody", { name: fullName })}
        confirmLabel={t("auth.signOut")}
        cancelLabel={t("auth.stayConnected")}
        onConfirm={async () => {
          const data = new FormData();
          data.set("locale", locale);
          // `signOut` redirige : elle ne rend jamais la main.
          await signOut(data);
        }}
      />
    </header>
  );
}
