"use client";

import { useState, useTransition } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ListPicker } from "@/components/list-picker";
import { shareFile } from "@/lib/share-file";
import { formatMoney } from "@/lib/format";
import type { Locale } from "@/i18n/routing";
import type { PDFFont, PDFPage, RGB } from "pdf-lib";

/** Une paire à étiqueter. Le QR code ne contient QUE sa référence. */
export type QrLabel = {
  ref: string;
  name: string;
  size: string | null;
  price: number;
};

/**
 * Une feuille 4 × 6 pouces (celle du bon de location), en points PDF, coupée
 * en SIX étiquettes carrées de 2 × 2 pouces (2 colonnes × 3 rangées) : le QR
 * en haut, la référence, la taille et le prix dessous.
 */
const MM = 72 / 25.4;
const PAGE_W = 4 * 72;
const PAGE_H = 6 * 72;
const COLS = 2;
const ROWS = 3;
const PER_PAGE = COLS * ROWS;
const SLOT_W = PAGE_W / COLS;
const SLOT_H = PAGE_H / ROWS;
const MARGIN = 3 * MM;
const LINE_GAP = 2;

/**
 * Les polices standard du PDF ne savent écrire que le latin (WinAnsi) : une
 * lettre arabe y ferait échouer tout le fichier. Les espaces fines des
 * montants deviennent des espaces simples, le reste devient « ? ».
 */
function winAnsi(text: string): string {
  return text
    .replace(/[   ]/g, " ")
    .replace(/[^\x20-\x7E -ÿ]/g, "?");
}

/** Coupe un texte à la largeur donnée, avec « … » s'il dépasse. */
function fit(
  text: string,
  width: number,
  measure: (s: string) => number,
): string {
  if (measure(text) <= width) return text;
  let cut = text;
  while (cut.length > 1 && measure(`${cut}...`) > width) cut = cut.slice(0, -1);
  return `${cut}...`;
}

type Fonts = { bold: PDFFont; regular: PDFFont };

/** Une étiquette dans sa case : le QR centré en haut, le texte centré dessous. */
function drawLabel(
  page: PDFPage,
  label: QrLabel,
  /** Coin bas-gauche de la case, depuis le BAS de la page (repère du PDF). */
  left: number,
  bottom: number,
  { bold, regular }: Fonts,
  modules: { size: number; get: (row: number, col: number) => number | boolean },
  locale: Locale,
  black: RGB,
) {
  const lines: { text: string; size: number; font: PDFFont }[] = [
    { text: winAnsi(label.ref), size: 11, font: bold },
    { text: winAnsi(label.name), size: 7, font: regular },
    ...(label.size ? [{ text: winAnsi(label.size), size: 13, font: bold }] : []),
    { text: winAnsi(formatMoney(label.price, locale)), size: 8, font: regular },
  ];
  const textH = lines.reduce((sum, line) => sum + line.size + LINE_GAP, 0);

  // Le QR prend toute la hauteur que le texte laisse, centré dans la case.
  const top = bottom + SLOT_H;
  const qrSide = Math.min(SLOT_H - 2 * MARGIN - textH, SLOT_W - 2 * MARGIN);
  const qrX = left + (SLOT_W - qrSide) / 2;
  const cell = qrSide / modules.size;
  for (let row = 0; row < modules.size; row++) {
    for (let col = 0; col < modules.size; col++) {
      if (!modules.get(row, col)) continue;
      page.drawRectangle({
        x: qrX + col * cell,
        y: top - MARGIN - (row + 1) * cell,
        // Un soupçon de plus : pas de liseré blanc entre deux cases.
        width: cell + 0.05,
        height: cell + 0.05,
        color: black,
      });
    }
  }

  const textW = SLOT_W - 2 * MARGIN;
  let y = top - MARGIN - qrSide;
  for (const line of lines) {
    y -= line.size + LINE_GAP;
    const text = fit(line.text, textW, (s) => line.font.widthOfTextAtSize(s, line.size));
    const width = line.font.widthOfTextAtSize(text, line.size);
    page.drawText(text, {
      x: left + (SLOT_W - width) / 2,
      y: y + LINE_GAP,
      size: line.size,
      font: line.font,
      color: black,
    });
  }
}

/** Six étiquettes par feuille 4 × 6 (2 × 3), séparées par un pointillé de coupe. */
async function buildLabelsPdf(labels: QrLabel[], locale: Locale): Promise<File> {
  const [{ PDFDocument, StandardFonts, rgb }, QRCode] = await Promise.all([
    import("pdf-lib"),
    import("qrcode"),
  ]);
  const pdf = await PDFDocument.create();
  const fonts = {
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    regular: await pdf.embedFont(StandardFonts.Helvetica),
  };
  const black = rgb(0, 0, 0);
  const grey = rgb(0.6, 0.6, 0.6);

  let page: PDFPage | null = null;
  for (const [i, label] of labels.entries()) {
    const slot = i % PER_PAGE;
    if (slot === 0) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      const cut = { thickness: 0.5, color: grey, dashArray: [4, 4] };
      for (let r = 1; r < ROWS; r++) {
        page.drawLine({ start: { x: 0, y: r * SLOT_H }, end: { x: PAGE_W, y: r * SLOT_H }, ...cut });
      }
      for (let c = 1; c < COLS; c++) {
        page.drawLine({ start: { x: c * SLOT_W, y: 0 }, end: { x: c * SLOT_W, y: PAGE_H }, ...cut });
      }
    }
    // Correction M : l'étiquette résiste à une rayure sans grossir le QR.
    const { modules } = QRCode.create(label.ref, { errorCorrectionLevel: "M" });
    // De gauche à droite, puis de haut en bas — le PDF compte les y depuis le BAS.
    const col = slot % COLS;
    const row = Math.floor(slot / COLS);
    drawLabel(page!, label, col * SLOT_W, PAGE_H - (row + 1) * SLOT_H, fonts, modules, locale, black);
  }

  const bytes = await pdf.save();
  const name = labels.length === 1 ? labels[0].ref : `qr-${labels[0].ref}`;
  return new File([bytes as BlobPart], `${name}.pdf`, { type: "application/pdf" });
}

/**
 * « Imprimer les QR » d'un modèle de VENTE : la liste de ses paires encore en
 * boutique, toutes cochées — on imprime tout, ou on ne garde que l'étiquette
 * perdue. Le PDF part à la feuille de partage (appli 4BARCODE).
 */
export function QrLabelsButton({ labels }: { labels: QrLabel[] }) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const [picker, setPicker] = useState<{ n: number; open: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();

  function print(keys: string[]) {
    setPicker((p) => (p ? { ...p, open: false } : p));
    const chosen = labels.filter((l) => keys.includes(l.ref));
    if (!chosen.length) return;
    startTransition(async () => {
      try {
        await shareFile(await buildLabelsPdf(chosen, locale));
      } catch {
        toast.error(t("errors.generic"));
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-11"
        disabled={isPending || labels.length === 0}
        onClick={() => setPicker({ n: Date.now(), open: true })}
      >
        {isPending ? <Spinner /> : <QrCode className="size-4" aria-hidden />}
        {t("stock.qr.print")}
      </Button>

      {picker && (
        <ListPicker
          key={picker.n}
          open={picker.open}
          onOpenChange={(open) => setPicker({ ...picker, open })}
          title={t("stock.qr.title")}
          options={labels.map((l) => ({
            key: l.ref,
            label: l.ref,
            secondary: l.size ? `${t("stock.size")} ${l.size}` : undefined,
            featured: true,
          }))}
          selected={labels.map((l) => l.ref)}
          onDone={print}
          allowNew={false}
        />
      )}
    </>
  );
}
