/**
 * Numéro de téléphone du client — module PUR, importé des deux côtés.
 *
 * L'équipe tape le numéro comme le client le dicte : « 0551 23 45 67 »,
 * « 0551-23-45-67 », ou recopié d'un WhatsApp en « +213 551 23 45 67 ». Ce
 * sont trois écritures du MÊME numéro. On les ramène à une seule avant de
 * vérifier et avant d'enregistrer : sinon la recherche par téléphone de la
 * liste des commandes ne retrouverait pas le client la fois suivante.
 */

/** Espaces, points, tirets et parenthèses : de la mise en forme, pas des chiffres. */
const SEPARATORS = /[\s.\-()]/g;

/**
 * Forme canonique : `0XXXXXXXXX`.
 *
 * Seul l'indicatif algérien est replié (`+213` ou `00213` → `0`). Un autre
 * indicatif est laissé tel quel, et sera donc refusé par `isAlgerianMobile` :
 * c'est voulu, la boutique ne loue qu'en Algérie.
 */
export function normalizePhone(raw: string): string {
  const compact = raw.replace(SEPARATORS, "");
  const international = /^(?:\+|00)213(\d+)$/.exec(compact);
  return international ? `0${international[1]}` : compact;
}

/**
 * Mobile algérien : 05 (Ooredoo), 06 (Mobilis), 07 (Djezzy), puis 8 chiffres.
 *
 * Quand il est saisi, c'est un MOBILE : c'est le numéro qu'on appelle quand un
 * retour tarde, et le fixe d'un domicile ne répond pas le lendemain d'un
 * mariage. Il n'est plus obligatoire depuis la saisie rapide.
 */
export function isAlgerianMobile(normalized: string): boolean {
  return /^0[5-7]\d{8}$/.test(normalized);
}
