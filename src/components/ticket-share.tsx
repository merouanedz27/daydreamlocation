"use client";

import { useTranslations } from "next-intl";
import { Loader2, Printer, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTicketPdf } from "@/components/ticket-pdf";

/**
 * Le geste du bon : « Partager / imprimer le PDF » — le fichier (une page
 * 4 × 6 par ticket) remis à la feuille de partage du téléphone : l'appli de
 * l'imprimante d'étiquettes (4BARCODE), WhatsApp, « Imprimer » sur iPhone. Sur
 * ordinateur, il se télécharge.
 *
 * Le partage du PDF et l'impression directe sont deux actions distinctes.
 *
 * Le bouton attend que les photos soient prêtes (une seconde à l'ouverture) :
 * c'est ce qui garantit que l'aperçu et le PDF sont identiques.
 */
export function TicketActions() {
  const t = useTranslations("print");
  const { file, images, failed } = useTicketPdf();
  const ready = Boolean(file && images);

  async function share() {
    if (!file) return;
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: file.name });
      } catch {
        // Feuille fermée sans choisir : rien à faire.
      }
      return;
    }
    // Ordinateur, ou navigateur sans partage de fichiers : on télécharge.
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  // Photos ratées : pas de PDF, on imprime quand même la page elle-même.
  if (failed) {
    return (
      <Button
        type="button"
        onClick={() => window.print()}
        className="h-10 text-sm"
      >
        <Printer className="size-5" aria-hidden />
        {t("print")}
      </Button>
    );
  }

  return (
    <div className="flex w-full items-center gap-2 lg:justify-between">
      <Button
        type="button"
        variant="outline"
        onClick={share}
        disabled={!ready}
        className="h-10 min-w-0 flex-1 px-0 lg:w-40 lg:flex-none"
        aria-label={t("share")}
        title={t("share")}
      >
        {ready ? (
          <Share2 className="size-3.5" aria-hidden />
        ) : (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        )}
        <span>{ready ? t("share") : t("preparing")}</span>
      </Button>

      <Button
        type="button"
        onClick={() => window.print()}
        className="h-10 min-w-0 flex-1 text-sm lg:w-40 lg:flex-none"
      >
        <Printer className="size-4" aria-hidden />
        {t("print")}
      </Button>
    </div>
  );
}
