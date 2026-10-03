"use client";

import { useTranslations } from "next-intl";
import { Loader2, Printer, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTicketPdf } from "@/components/ticket-pdf";

/**
 * Les deux gestes du bon, côte à côte :
 *
 * - « Partager le PDF » — le fichier (une page 4 × 6 par ticket) remis à la
 *   feuille de partage du téléphone : l'appli de l'imprimante d'étiquettes
 *   (4BARCODE), WhatsApp, « Imprimer » sur iPhone. Sur ordinateur, il se
 *   télécharge ;
 * - « Imprimer » — la boîte d'impression, DIRECTEMENT. Elle imprime les mêmes
 *   photos 4 × 6 que le PDF (voir `TicketFrame`), chacune ajustée à la page :
 *   rien ne déborde, même quand le téléphone impose son propre papier.
 *
 * Les deux attendent que les photos soient prêtes (une seconde à l'ouverture) :
 * c'est ce qui garantit que l'aperçu, le PDF et le papier sont identiques.
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

  const spinner = <Loader2 className="size-4 animate-spin" aria-hidden />;

  return (
    <>
      {!failed && (
        // Icône seule : à 390 px, le libellé prenait la place d'« Imprimer ».
        // Le nom reste lu par les lecteurs d'écran et affiché au survol.
        <Button
          type="button"
          size="icon"
          onClick={share}
          disabled={!ready}
          title={ready ? t("share") : t("preparing")}
          className="size-11 shrink-0"
        >
          {ready ? <Share2 className="size-5" aria-hidden /> : spinner}
          <span className="sr-only">{ready ? t("share") : t("preparing")}</span>
        </Button>
      )}
      {/* Photos ratées : on imprime quand même, la page elle-même. */}
      <Button
        type="button"
        variant="outline"
        onClick={() => window.print()}
        disabled={!ready && !failed}
        className="h-11"
      >
        {ready || failed ? <Printer className="size-4" aria-hidden /> : spinner}
        {t("print")}
      </Button>
    </>
  );
}
