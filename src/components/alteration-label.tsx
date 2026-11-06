import { Scissors } from "lucide-react";
import { OrderQr } from "@/components/order-qr";
import { formatDate } from "@/lib/format";
import type { Locale } from "@/i18n/routing";

/**
 * L'ÉTIQUETTE d'une retouche — la MÊME sur la feuille d'étiquettes
 * (`/imprimer/retouches`) et en bas du ticket du costume (bon, page 2).
 *
 * QR à gauche ; à côté, sur la hauteur du QR : le client, le NOM de la pièce,
 * la taille, la date et ce qu'il faut faire. Jamais la référence (demande du
 * client). Tailles en pt et en pouces : l'ajustement automatique du bon
 * (`fitTicket`, en `em`) ne la grossit pas.
 */
export function AlterationLabel({
  url,
  customerName,
  modelName,
  sizeLabel,
  eventDate,
  note,
  locale,
}: {
  url: string;
  customerName: string;
  modelName: string | null;
  /** « T. 52 », déjà traduit — `null` sans taille. */
  sizeLabel: string | null;
  eventDate: string;
  note: string;
  locale: Locale;
}) {
  return (
    // `dir="ltr"` : le QR à gauche sur une étiquette arabe aussi ; chaque
    // ligne de texte garde son sens (`dir="auto"` / `<bdi>`).
    <div dir="ltr" className="flex min-w-0 gap-[1.5mm]">
      <OrderQr value={url} className="block size-[0.7in] shrink-0" />
      {/* La colonne ne dépasse pas la hauteur du QR : ce qui ne tient pas est
          coupé, la retouche garde ses trois lignes. */}
      <div className="flex h-[0.7in] min-w-0 flex-1 flex-col justify-center overflow-hidden leading-[1.15]">
        <p dir="auto" className="truncate text-start text-[7.5pt] font-bold">
          {customerName}
        </p>
        {modelName && (
          <p dir="auto" className="truncate text-start text-[6.5pt]">
            {modelName}
          </p>
        )}
        <p className="flex items-baseline gap-x-[1.5mm]">
          {sizeLabel && <span className="text-[7pt] font-bold">{sizeLabel}</span>}
          <span className="tabular text-[6.5pt] font-bold">{formatDate(eventDate, locale)}</span>
        </p>
        <p
          dir="auto"
          className="mt-[0.4mm] flex min-w-0 items-start gap-[1mm] text-start text-[7pt] font-bold"
        >
          <Scissors className="mt-[0.3mm] size-[6.5pt] shrink-0" aria-hidden />
          <bdi className="line-clamp-3 min-w-0 wrap-break-word">{note}</bdi>
        </p>
      </div>
    </div>
  );
}
