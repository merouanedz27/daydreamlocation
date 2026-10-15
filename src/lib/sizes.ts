/**
 * Les SÉRIES de tailles proposées à l'ajout de pièces — module PUR.
 *
 * Le propriétaire achète un modèle « en série » : la même veste en 46, 48, 50,
 * 52… Il coche les tailles reçues et obtient une pièce par taille, au lieu de
 * remplir la même fiche cinq fois.
 */

/** Costumes : 44 à 66, de deux en deux — les tailles de son tableur. */
export const SUIT_SIZES = Array.from({ length: 12 }, (_, i) => String(44 + i * 2));
/** Chemises dans la saisie d'une commande : tailles de confection. */
export const ORDER_SHIRT_SIZES = ["S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL", "6XL"];
const SHOE_SIZES = Array.from({ length: 9 }, (_, i) => String(38 + i));

const SERIES: Record<string, string[]> = {
  veste: SUIT_SIZES,
  pantalon: SUIT_SIZES,
  gilet: SUIT_SIZES,
  costume: SUIT_SIZES,
  chemise: ORDER_SHIRT_SIZES,
  jabador: ORDER_SHIRT_SIZES,
  chaussures: SHOE_SIZES,
  bligha: SHOE_SIZES,
};

/** La série d'une catégorie ; vide = taille libre seulement. */
export function sizeSeries(categorySlug: string | null | undefined): string[] {
  return (categorySlug && SERIES[categorySlug]) || [];
}

/** « xxl » et « 2XL » sont la même taille : ses listes écrivent l'une ou l'autre. */
export function normalizeSize(size: string): string {
  const s = size.trim().toUpperCase();
  const x = /^(X{2,4})L$/.exec(s);
  return x ? `${x[1].length}XL` : s;
}

/** Le libellé porte-t-il cette taille ? « Chemise Cravate Blanc 2XL » porte XXL. */
export function labelHasSize(label: string, size: string): boolean {
  const wanted = normalizeSize(size);
  if (!wanted) return false;
  return label.split(/[\s\-·]+/).some((token) => normalizeSize(token) === wanted);
}

/** La première taille de `series` écrite dans le libellé, sinon `null`. */
export function sizeInLabel(label: string, series: string[]): string | null {
  return series.find((size) => labelHasSize(label, size)) ?? null;
}

/** Rang d'une taille de confection : XS, S, M, L, XL, 2XL… 6XL ; -1 sinon. */
function letterRank(size: string): number {
  const s = normalizeSize(size);
  const base = ["XS", "S", "M", "L", "XL"].indexOf(s);
  if (base >= 0) return base;
  const x = /^([2-9])XL$/.exec(s);
  return x ? 3 + Number(x[1]) : -1;
}

/**
 * Tailles distinctes, dans l'ordre naturel : 46, 48, 50… puis S, M, L, XL,
 * XXL, 3XL… puis le reste du texte libre par ordre alphabétique.
 */
export function sortSizes(sizes: (string | null | undefined)[]): string[] {
  const unique = [...new Set(sizes.map((s) => s?.trim()).filter((s): s is string => Boolean(s)))];
  return unique.sort((a, b) => {
    const na = Number(a.replace(",", "."));
    const nb = Number(b.replace(",", "."));
    const aNum = Number.isFinite(na);
    const bNum = Number.isFinite(nb);
    if (aNum && bNum) return na - nb;
    if (aNum) return -1;
    if (bNum) return 1;
    const ra = letterRank(a);
    const rb = letterRank(b);
    if (ra >= 0 && rb >= 0) return ra - rb;
    if (ra >= 0) return -1;
    if (rb >= 0) return 1;
    return a.localeCompare(b);
  });
}
