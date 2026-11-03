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

/** Une paire à étiqueter. Le QR code ne contient QUE sa référence. */
export type QrLabel = {
  ref: string;
  name: string;
  size: string | null;
  price: number;
};

/** 50 × 30 mm, en points PDF : le format des petites étiquettes 4BARCODE. */
const MM = 72 / 25.4;
const LABEL_W = 50 * MM;
const LABEL_H = 30 * MM;
const MARGIN = 2 * MM;

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

/** Une page par étiquette : le QR à gauche, la référence en gros à côté. */
async function buildLabelsPdf(labels: QrLabel[], locale: Locale): Promise<File> {
  const [{ PDFDocument, StandardFonts, rgb }, QRCode] = await Promise.all([
    import("pdf-lib"),
    import("qrcode"),
  ]);
  const pdf = await PDFDocument.create();
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const black = rgb(0, 0, 0);

  for (const label of labels) {
    const page = pdf.addPage([LABEL_W, LABEL_H]);
    // Correction M : l'étiquette résiste à une rayure sans grossir le QR.
    const { modules } = QRCode.create(label.ref, { errorCorrectionLevel: "M" });
    const qrSide = LABEL_H - 2 * MARGIN;
    const cell = qrSide / modules.size;
    for (let row = 0; row < modules.size; row++) {
      for (let col = 0; col < modules.size; col++) {
        if (!modules.get(row, col)) continue;
        page.drawRectangle({
          x: MARGIN + col * cell,
          // Le PDF compte les y depuis le BAS de la page.
          y: LABEL_H - MARGIN - (row + 1) * cell,
          // Un soupçon de plus : pas de liseré blanc entre deux cases.
          width: cell + 0.05,
          height: cell + 0.05,
          color: black,
        });
      }
    }

    const textX = MARGIN + qrSide + 1.5 * MM;
    const textW = LABEL_W - textX - MARGIN;
    const lines: { text: string; size: number; font: typeof bold }[] = [
      { text: winAnsi(label.ref), size: 9, font: bold },
      { text: winAnsi(label.name), size: 6.5, font: regular },
      ...(label.size ? [{ text: winAnsi(label.size), size: 11, font: bold }] : []),
      { text: winAnsi(formatMoney(label.price, locale)), size: 7, font: regular },
    ];
    let y = LABEL_H - MARGIN - 9;
    for (const line of lines) {
      page.drawText(
        fit(line.text, textW, (s) => line.font.widthOfTextAtSize(s, line.size)),
        { x: textX, y, size: line.size, font: line.font, color: black },
      );
      y -= line.size + 3;
    }
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
