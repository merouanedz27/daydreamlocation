"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** 4 × 6 pouces : 384 × 576 px CSS (96 px au pouce), 288 × 432 points PDF. */
const WIDTH_PX = 384;
const HEIGHT_PX = 576;
const PAGE_PT: [number, number] = [288, 432];
/** ≈ 290 ppp : plus fin que la tête d'une imprimante thermique (203 / 300 ppp). */
const PIXEL_RATIO = 3;

/**
 * « Partager le PDF » — le bon en VRAI fichier PDF, une page 4 × 6 par ticket,
 * remis à la feuille de partage du téléphone.
 *
 * Pourquoi pas `window.print()` : sur Android, la boîte d'impression ne
 * propose que « Enregistrer au format PDF », pas l'application de
 * l'imprimante d'étiquettes (4BARCODE) ; sur iPhone, une app installée
 * (PWA) n'imprime pas du tout. La feuille de partage, elle, montre
 * l'application de l'imprimante, WhatsApp, et « Imprimer » sur iPhone.
 *
 * Chaque ticket (`[data-ticket]`) est PHOTOGRAPHIÉ tel que le navigateur
 * l'affiche, puis posé sur une page : l'arabe garde sa police et son sens
 * d'écriture, ce qu'une bibliothèque PDF qui écrit le texte gère mal.
 *
 * Le PDF se prépare DÈS L'OUVERTURE de la page : Safari refuse d'ouvrir la
 * feuille de partage si le toucher remonte à plus d'un instant — il faut que
 * le fichier soit déjà prêt quand on appuie.
 */
export function TicketShare({ fileName }: { fileName: string }) {
  const t = useTranslations("print");
  const [file, setFile] = useState<File | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    buildPdf(fileName)
      .then((built) => !cancelled && setFile(built))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [fileName]);

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

  if (failed) return null;

  return (
    <Button type="button" onClick={share} disabled={!file} className="h-11">
      {file ? (
        <Share2 className="size-4" aria-hidden />
      ) : (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      )}
      {file ? t("share") : t("preparing")}
    </Button>
  );
}

async function buildPdf(fileName: string): Promise<File> {
  const [{ toCanvas }, { PDFDocument }] = await Promise.all([
    import("html-to-image"),
    import("pdf-lib"),
  ]);

  // Polices (l'arabe) et images (le logo) chargées, sinon le ticket sortirait
  // sans logo, dans la police de secours.
  await document.fonts.ready;
  await Promise.all(
    Array.from(document.images).map((img) =>
      img.complete ? undefined : img.decode().catch(() => undefined),
    ),
  );

  const pdf = await PDFDocument.create();
  pdf.setTitle(fileName);

  for (const ticket of Array.from(document.querySelectorAll<HTMLElement>("[data-ticket]"))) {
    const canvas = await snapshot(ticket, toCanvas);
    const bytes = await new Promise<ArrayBuffer>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? blob.arrayBuffer().then(resolve, reject) : reject(new Error("toBlob"))),
        "image/jpeg",
        0.92,
      ),
    );
    const image = await pdf.embedJpg(bytes);
    const page = pdf.addPage(PAGE_PT);
    // Un ticket plus long que 6 pouces est RÉDUIT pour tenir sur sa page,
    // jamais coupé sur une seconde.
    const scale = Math.min(PAGE_PT[0] / image.width, PAGE_PT[1] / image.height);
    const w = image.width * scale;
    const h = image.height * scale;
    page.drawImage(image, { x: (PAGE_PT[0] - w) / 2, y: PAGE_PT[1] - h, width: w, height: h });
  }

  const bytes = await pdf.save();
  return new File([bytes as BlobPart], `${fileName}.pdf`, { type: "application/pdf" });
}

/**
 * Photographie un ticket à la largeur EXACTE du papier (4 pouces), quelle que
 * soit la largeur de l'écran : sur un téléphone, le ticket affiché est plus
 * étroit. On en pose donc une copie hors de l'écran, au bon gabarit, dans le
 * même parent — elle hérite de la langue, du sens et des polices.
 */
async function snapshot(
  ticket: HTMLElement,
  toCanvas: typeof import("html-to-image").toCanvas,
): Promise<HTMLCanvasElement> {
  const copy = ticket.cloneNode(true) as HTMLElement;
  copy.removeAttribute("data-ticket");
  Object.assign(copy.style, {
    position: "fixed",
    top: "0",
    left: "-10000px",
    width: `${WIDTH_PX}px`,
    maxWidth: "none",
    minHeight: `${HEIGHT_PX}px`,
    margin: "0",
    border: "0",
    borderRadius: "0",
  });
  ticket.parentElement!.appendChild(copy);
  try {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const options = {
      width: WIDTH_PX,
      height: Math.max(HEIGHT_PX, copy.scrollHeight),
      pixelRatio: PIXEL_RATIO,
      backgroundColor: "#ffffff",
      // La copie est hors de l'écran : dans l'image, elle se pose à l'origine.
      style: { position: "static", left: "auto" },
    };
    // Safari n'intègre les images et les polices qu'au DEUXIÈME passage : le
    // premier sert d'échauffement.
    await toCanvas(copy, options);
    return await toCanvas(copy, options);
  } finally {
    copy.remove();
  }
}
