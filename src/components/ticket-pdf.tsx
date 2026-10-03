"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { fitTicket } from "@/lib/fit-ticket";

/** 4 × 6 pouces : 384 × 576 px CSS (96 px au pouce), 288 × 432 points PDF. */
const WIDTH_PX = 384;
const HEIGHT_PX = 576;
const PAGE_PT: [number, number] = [288, 432];
/** ≈ 290 ppp : plus fin que la tête d'une imprimante thermique (203 / 300 ppp). */
const PIXEL_RATIO = 3;

type TicketPdf = {
  /** Le PDF partagé : une page 4 × 6 par ticket. */
  file: File | null;
  /** Les MÊMES photos, une par ticket, dans l'ordre de la page. */
  images: string[] | null;
  failed: boolean;
};

const Context = createContext<TicketPdf>({ file: null, images: null, failed: false });

export const useTicketPdf = () => useContext(Context);

/**
 * Prépare, DÈS L'OUVERTURE du bon, une photo 4 × 6 de chaque ticket
 * (`[data-ticket]`) et le PDF qui les contient.
 *
 * Ces photos servent PARTOUT : à l'écran (l'aperçu montre exactement ce que
 * l'appli de l'imprimante recevra), dans le PDF partagé, et à l'impression.
 * Un seul rendu, plus de différence entre ce qu'on voit et ce qui sort.
 *
 * Photographier plutôt qu'écrire le texte dans le PDF : l'arabe garde sa
 * police et son sens d'écriture, ce qu'une bibliothèque PDF gère mal.
 * Préparé d'avance : Safari refuse d'ouvrir la feuille de partage si le
 * toucher remonte à plus d'un instant.
 */
export function TicketPdfProvider({
  fileName,
  children,
}: {
  fileName: string;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<TicketPdf>({ file: null, images: null, failed: false });

  useEffect(() => {
    let cancelled = false;
    let urls: string[] = [];
    buildPdf(fileName)
      .then(({ file, blobs }) => {
        urls = blobs.map((b) => URL.createObjectURL(b));
        if (cancelled) urls.forEach((u) => URL.revokeObjectURL(u));
        else setState({ file, images: urls, failed: false });
      })
      .catch(() => !cancelled && setState({ file: null, images: null, failed: true }));
    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [fileName]);

  return <Context.Provider value={state}>{children}</Context.Provider>;
}

async function buildPdf(fileName: string): Promise<{ file: File; blobs: Blob[] }> {
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
  const blobs: Blob[] = [];

  for (const ticket of Array.from(document.querySelectorAll<HTMLElement>("[data-ticket]"))) {
    const canvas = await snapshot(ticket, toCanvas);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/jpeg", 0.92),
    );
    blobs.push(blob);
    const image = await pdf.embedJpg(await blob.arrayBuffer());
    const page = pdf.addPage(PAGE_PT);
    // La photo fait pile 4 × 6 (texte déjà ajusté) : elle couvre la page.
    page.drawImage(image, { x: 0, y: 0, width: PAGE_PT[0], height: PAGE_PT[1] });
  }

  const bytes = await pdf.save();
  return {
    file: new File([bytes as BlobPart], `${fileName}.pdf`, { type: "application/pdf" }),
    blobs,
  };
}

/**
 * Photographie un ticket à la taille EXACTE du papier (4 × 6 pouces), quelle
 * que soit la largeur de l'écran. On en pose une copie hors de l'écran, au bon
 * gabarit, dans le même parent — elle hérite de la langue, du sens et des
 * polices.
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
    height: `${HEIGHT_PX}px`,
    maxWidth: "none",
    margin: "0",
    border: "0",
    borderRadius: "0",
    scale: "none",
    visibility: "visible",
  });
  ticket.parentElement!.appendChild(copy);
  try {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    fitTicket(copy);
    const options = {
      width: WIDTH_PX,
      height: HEIGHT_PX,
      pixelRatio: PIXEL_RATIO,
      backgroundColor: "#ffffff",
      // Sans lui, deux images qui ne diffèrent que par `?url=…` (le cas de
      // `/_next/image`) partagent la même entrée de cache : le 2ᵉ logo
      // devenait le 1ᵉʳ.
      includeQueryParams: true,
      // La copie est hors de l'écran : dans l'image, elle se pose à l'origine.
      style: { position: "static", left: "auto", scale: "none" },
    };
    // Safari n'intègre les images et les polices qu'au DEUXIÈME passage : le
    // premier sert d'échauffement.
    await toCanvas(copy, options);
    return await toCanvas(copy, options);
  } finally {
    copy.remove();
  }
}
