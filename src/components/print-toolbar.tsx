"use client";

import { useEffect } from "react";
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
 * `autoPrint` ouvre la boîte d'impression dès que la page est prête : c'est
 * le bouton « Bon de location » de la fiche, qui doit imprimer DIRECTEMENT.
 * Ouvert autrement (lien recopié, rechargement), le document attend le bouton
 * — on peut alors changer de langue avant d'imprimer.
 */
export function PrintToolbar({
  backHref,
  hint,
  children,
  autoPrint = false,
}: {
  backHref: string;
  autoPrint?: boolean;
  /** Une ligne d'aide sous la barre — le bon l'utilise pour dire comment obtenir un PDF. */
  hint?: string;
  /** Réglages propres au document (la date de la feuille du jour, par exemple). */
  children?: React.ReactNode;
}) {
  const t = useTranslations();

  useEffect(() => {
    if (!autoPrint) return;
    // Le paramètre part de l'adresse : recharger la page ne relance pas
    // l'impression.
    const url = new URL(window.location.href);
    url.searchParams.delete("auto");
    window.history.replaceState(window.history.state, "", url);

    // Attendre les polices (l'arabe) et les images (le logo) : imprimer avant
    // donnerait un ticket sans logo, dans la police de secours.
    let cancelled = false;
    const images = Array.from(document.images).map((img) =>
      img.complete ? Promise.resolve() : img.decode().catch(() => undefined),
    );
    void Promise.all([document.fonts.ready, ...images]).then(() => {
      if (!cancelled) window.print();
    });
    return () => {
      cancelled = true;
    };
  }, [autoPrint]);

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
