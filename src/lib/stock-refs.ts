/**
 * Dérivation des références de pièces à partir du code fournisseur.
 *
 * « Gio-079 » donne « Gio-079-01 », « Gio-079-02 »… Le client garde les codes
 * qu'il connaît, tout en pouvant enfin distinguer deux vestes de même taille.
 *
 * Cette logique est utilisée à DEUX endroits — le formulaire, qui annonce la
 * prochaine référence, et la Server Action, qui l'attribue. Les deux doivent
 * donner le même résultat, sinon l'employé voit une référence et en obtient une
 * autre. D'où ce module unique.
 */

/**
 * On repart du plus grand suffixe EXISTANT, et non du nombre de pièces :
 * une pièce retirée laisserait un trou, et compter recréerait une référence
 * déjà portée par une commande passée. L'historique s'en trouverait faussé.
 */
export function highestSuffix(prefix: string, existingRefs: string[]): number {
  let max = 0;
  for (const ref of existingRefs) {
    if (!ref?.startsWith(prefix)) continue;
    const n = Number.parseInt(ref.slice(prefix.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

export function unitRefPrefix(modelRefCode: string): string {
  return `${modelRefCode}-`;
}

/** Les `count` prochaines références libres pour ce modèle. */
export function nextUnitRefs(
  modelRefCode: string,
  existingRefs: string[],
  count = 1,
): string[] {
  const prefix = unitRefPrefix(modelRefCode);
  const start = highestSuffix(prefix, existingRefs);
  return Array.from(
    { length: count },
    (_, i) => `${prefix}${String(start + i + 1).padStart(2, "0")}`,
  );
}

/**
 * Les PARTIES d'un costume divisible, dans l'ordre où on les montre. Un
 * costume « TUX-A-03 » est un jeu de pièces réelles : « TUX-A-03-V » (veste),
 * « TUX-A-03-P » (pantalon), « TUX-A-03-G » (gilet). Chacune se loue seule,
 * ou toutes ensemble pour le costume complet.
 *
 * Le numéro du costume suit la même dérivation que les pièces simples :
 * `highestSuffix` lit « 03 » dans « TUX-A-03-V » (`parseInt` s'arrête au
 * tiret), donc `nextUnitRefs` donne le prochain costume libre.
 */
export const PARTS = ["veste", "pantalon", "gilet"] as const;
export type Part = (typeof PARTS)[number];

export const PART_SUFFIX: Record<Part, string> = { veste: "V", pantalon: "P", gilet: "G" };

export function isPart(value: unknown): value is Part {
  return PARTS.includes(value as Part);
}

/** « TUX-A-03 » + pantalon → « TUX-A-03-P ». */
export function partRef(setRef: string, part: Part): string {
  return `${setRef}-${PART_SUFFIX[part]}`;
}

/** Les parties dans l'ordre d'affichage, quel que soit l'ordre reçu. */
export function sortParts<T extends { part: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => PARTS.indexOf(a.part as Part) - PARTS.indexOf(b.part as Part),
  );
}
