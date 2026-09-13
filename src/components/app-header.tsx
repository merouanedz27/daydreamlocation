"use client";

import {
  ClipboardList,
  Download,
  LayoutGrid,
  LogOut,
  Receipt,
  Store,
  TrendingUp,
  User,
  Users,
} from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { Link, usePathname } from "@/i18n/navigation";
import { AccountSheet } from "@/components/account-sheet";
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
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/routing";
import ddLogoTrim from "../../public/dd-logo-trim.png";

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
  const items = [
    { href: "/commandes", icon: ClipboardList, label: t("nav.orders") },
    { href: "/stock", icon: LayoutGrid, label: t("nav.stock") },
    // Dépenses n'entre PAS dans la barre basse : elle porte déjà quatre
    // cibles, et une cinquième casserait les 44 px à 390 px de large. Sur
    // téléphone on y accède par le menu compte et le tableau de bord.
    ...(showDashboard
      ? [
          {
            href: "/tableau-de-bord",
            icon: TrendingUp,
            label: t("nav.dashboard"),
          },
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
        {/* LE LOGO, À NU SUR LA BARRE — fond transparent, aucune plaque.
            À savoir si l'on reprend cette barre un jour : le logo est un
            bitmap à deux tons, dessiné pour un fond CLAIR. Contrastes MESURÉS
            contre la barre éclaircie, à son pire cas (#816753) :
              « D » blanc du bloc gauche  5,25:1  — franc
              bloc gris clair #EEEEEE     4,53:1  — franc
              bloc brun      #522504      2,46:1  — se devine
              mot « location » #401B01    2,91:1  — faible
            Les deux « D » portent donc la marque ; le mot reste en retrait.
            L'éclaircissement de la barre l'a nettement amélioré (1,73 et 2,04
            auparavant) sans le rendre franc — il ne peut pas aller plus loin
            sans basculer la barre en texte encre, cf. `globals.css`.
            PAS d'ombre portée pour compenser : elle salirait le gris clair du
            logo sans rien gagner sur le brun.

            `dd-logo-trim.png` est le MÊME verrou que `dd-logo.png`, seulement
            débarrassé de sa marge transparente (42 px en haut, 16 px en bas
            sur 454) — c'est l'endroit qui décide du calage, pas le fichier.
            Le pied de page s'en sert aussi.

            Le `alt` n'est pas décoratif : plus aucun texte n'accompagne le
            logo, il est donc le SEUL nom accessible de ce lien. */}
        <Link href="/commandes" className="flex shrink-0 items-center">
          <Image
            src={ddLogoTrim}
            alt={t("app.name")}
            priority
            sizes="44px"
            className="h-9 w-auto"
          />
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

          {/* Téléphone : tiroir latéral. Bureau : le menu déroulant ci-dessous.
              Les deux ouvrent la MÊME confirmation de déconnexion. */}
          <AccountSheet
            fullName={fullName}
            roleLabel={roleLabel}
            showAdmin={showDashboard}
            onSignOut={() => setSignOutOpen(true)}
            onInstall={installApp.available ? installApp.install : undefined}
            triggerClassName="text-nav-muted hover:bg-nav-foreground/8 hover:text-nav-foreground md:hidden"
          />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-nav-muted hover:bg-nav-foreground/8 hover:text-nav-foreground hidden size-10 md:inline-flex"
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

              {showDashboard && (
                <>
                  {/* Ce menu ne sert plus qu'au bureau, où Dépenses est déjà
                      dans la barre horizontale. L'équipe et la boutique, elles,
                      restent ICI : la barre porte déjà quatre entrées, et ce
                      sont des gestes rares. */}
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
