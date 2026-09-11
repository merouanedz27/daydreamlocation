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
