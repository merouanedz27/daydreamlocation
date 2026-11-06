"use client";

import { useState } from "react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Link } from "@/i18n/navigation";
import { signOut } from "@/lib/actions/auth";
import type { Locale } from "@/i18n/routing";
import wordmark from "../../public/logo-wordmark.png";

/**
 * L'en-tête de l'ATELIER : le logo, le nom, la langue, la déconnexion — rien
 * d'autre. Le tailleur n'a ni commandes, ni stock, ni frais à rejoindre ; un
 * membre du magasin venu scanner retourne aux commandes par le logo.
 */
export function AtelierHeader({
  fullName,
  roleLabel,
  homeHref,
}: {
  fullName: string;
  roleLabel: string;
  homeHref: string;
}) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const [signOutOpen, setSignOutOpen] = useState(false);

  return (
    <header className="border-nav-border bg-nav text-nav-foreground sticky top-0 z-40 border-b">
      <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
        <Link href={homeHref} className="flex shrink-0 items-center">
          <Image
            src={wordmark}
            alt={t("app.name")}
            priority
            sizes="140px"
            className="h-5 w-auto brightness-0 invert"
          />
        </Link>
        <div className="min-w-0 flex-1 text-end">
          <p className="truncate text-sm font-medium">{fullName}</p>
          <p className="text-nav-muted truncate text-xs">{roleLabel}</p>
        </div>
        <LocaleSwitcher className="border-nav-border bg-nav-foreground/10 text-nav-foreground hover:bg-nav-foreground/20" />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setSignOutOpen(true)}
          className="text-nav-muted hover:bg-nav-foreground/8 hover:text-nav-foreground size-11"
        >
          <LogOut className="size-5 rtl:-scale-x-100" aria-hidden />
          <span className="sr-only">{t("auth.signOut")}</span>
        </Button>
      </div>

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
          await signOut(data);
        }}
      />
    </header>
  );
}
