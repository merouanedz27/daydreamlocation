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
 * UN SEUL bouton, avec son libellé : l'équipe hésitait entre lui et un second
 * « Imprimer » (la boîte d'impression du navigateur), retiré. Il ne revient
 * que si les photos ont raté — le PDF n'existe pas, on imprime la page.
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
      <Button type="button" onClick={() => window.print()} className="h-12 text-base">
        <Printer className="size-5" aria-hidden />
        {t("print")}
      </Button>
    );
  }

  return (
    <Button type="button" onClick={share} disabled={!ready} className="h-12 text-base">
      {ready ? (
        <Share2 className="size-5" aria-hidden />
      ) : (
        <Loader2 className="size-5 animate-spin" aria-hidden />
      )}
      {ready ? t("share") : t("preparing")}
    </Button>
  );
}
