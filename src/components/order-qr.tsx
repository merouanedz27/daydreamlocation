import QRCode from "qrcode";
import { cn } from "@/lib/utils";

/**
 * Un QR code en SVG dessiné par le serveur : un seul `<path>`, aucune image
 * à charger. html-to-image (le PDF partagé du bon) le photographie tel quel.
 *
 * Correction M : le ticket thermique se froisse dans une poche.
 */
export function OrderQr({ value, className }: { value: string; className?: string }) {
  const { modules } = QRCode.create(value, { errorCorrectionLevel: "M" });
  const size = modules.size;
  let d = "";
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (modules.get(row, col)) d += `M${col} ${row}h1v1h-1z`;
    }
  }
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      aria-hidden
      className={cn("[print-color-adjust:exact]", className)}
    >
      <rect width={size} height={size} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}
