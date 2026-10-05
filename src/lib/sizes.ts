/**
 * Les SÉRIES de tailles proposées à l'ajout de pièces — module PUR.
 *
 * Le propriétaire achète un modèle « en série » : la même veste en 46, 48, 50,
 * 52… Il coche les tailles reçues et obtient une pièce par taille, au lieu de
 * remplir la même fiche cinq fois.
 */

/** Costumes : 44 à 66, de deux en deux — les tailles de son tableur. */
export const SUIT_SIZES = Array.from({ length: 12 }, (_, i) => String(44 + i * 2));
const SHIRT_SIZES = Array.from({ length: 10 }, (_, i) => String(37 + i));
const SHOE_SIZES = Array.from({ length: 9 }, (_, i) => String(38 + i));

const SERIES: Record<string, string[]> = {
  veste: SUIT_SIZES,
  pantalon: SUIT_SIZES,
  gilet: SUIT_SIZES,
  costume: SUIT_SIZES,
  chemise: SHIRT_SIZES,
  chaussures: SHOE_SIZES,
  bligha: SHOE_SIZES,
};

/** La série d'une catégorie ; vide = taille libre seulement. */
export function sizeSeries(categorySlug: string | null | undefined): string[] {
  return (categorySlug && SERIES[categorySlug]) || [];
}

/**
 * Tailles distinctes, dans l'ordre naturel : 46, 48, 50… puis le texte libre
 * (M, L…) par ordre alphabétique.
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
    return a.localeCompare(b);
  });
}
