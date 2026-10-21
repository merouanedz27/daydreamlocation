"use client";

import { useTranslations } from "next-intl";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * « Retour » de la page hors ligne : l'écran d'où l'on venait, resservi par le
 * service worker. Sans écran précédent (application rouverte sur une adresse
 * jamais gardée), la liste des commandes.
 */
export function OfflineBackButton() {
  const t = useTranslations();
  return (
    <Button
      type="button"
      variant="outline"
      className="h-11 w-full"
      onClick={() => {
        if (window.history.length > 1) window.history.back();
        else window.location.replace(`/${document.documentElement.lang || "fr"}/commandes`);
      }}
    >
      <ChevronLeft className="size-4 rtl:-scale-x-100" aria-hidden />
      {t("common.back")}
    </Button>
  );
}
