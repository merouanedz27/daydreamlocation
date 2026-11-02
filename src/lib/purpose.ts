/**
 * L'USAGE d'un modèle : loué ou vendu (`article_models.purpose`).
 *
 * Une paire à vendre reste une pièce comme une autre ; seule sa ligne de
 * commande change de nature, et c'est la base qui la déduit de cet usage —
 * jamais le téléphone. Voir la migration `20261102100000_vente.sql`.
 */
export const PURPOSES = ["location", "vente"] as const;
export type Purpose = (typeof PURPOSES)[number];

/** Toute valeur inconnue ou absente vaut « location », le cas historique. */
export function parsePurpose(value: unknown): Purpose {
  return value === "vente" ? "vente" : "location";
}
