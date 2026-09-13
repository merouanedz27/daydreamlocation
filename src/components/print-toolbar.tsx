"use client";

import { useTranslations } from "next-intl";
import { ChevronLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Link } from "@/i18n/navigation";

/**
 * Barre d'outils d'un document imprimable — À L'ÉCRAN SEULEMENT.
 *
 * « Imprimer / PDF » ouvre la boîte d'impression du navigateur, qui propose
 * aussi « Enregistrer au format PDF » : c'est ainsi qu'on TÉLÉCHARGE le bon
 * pour l'envoyer au client, sans bibliothèque PDF — qui gère mal l'arabe.
 *
 * On n'ouvre PAS la boîte automatiquement à l'arrivée : l'employé doit d'abord
 * voir le document, et pouvoir changer de langue avant d'imprimer.
 */
export function PrintToolbar({
  backHref,
  hint,
  children,
}: {
  backHref: string;
  /** Une ligne d'aide sous la barre — le bon l'utilise pour dire comment obtenir un PDF. */
  hint?: string;
  /** Réglages propres au document (la date de la feuille du jour, par exemple). */
  children?: React.ReactNode;
}) {
  const t = useTranslations();

  return (
    <div className="mx-auto mb-4 max-w-[210mm] print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" className="h-11">
          <Link href={backHref}>
            <ChevronLeft className="size-4 rtl:-scale-x-100" aria-hidden />
            {t("common.back")}
          </Link>
        </Button>

        <div className="ms-auto flex items-center gap-2">
          <LocaleSwitcher />
          <Button type="button" onClick={() => window.print()} className="h-11">
            <Printer className="size-4" aria-hidden />
            {t("print.print")}
          </Button>
        </div>
      </div>

      {children && <div className="mt-3">{children}</div>}

      {hint && <p className="text-muted-foreground mt-2 text-xs">{hint}</p>}
    </div>
  );
}
