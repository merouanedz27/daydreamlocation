/**
 * Recherche texte — module PUR, utilisable côté serveur comme côté client.
 *
 * (Il vivait dans `suggest-input.tsx`, un module « use client » : une page
 * serveur qui l'importait recevait une référence client, pas une fonction.)
 */

/** Minuscules et sans accents : « Chemise » se trouve en tapant « chemise ». */
export function normalizeSearch(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

/**
 * Vrai si `q` est vide ou contenu dans l'un des champs. Sert aux listes
 * filtrées EN MÉMOIRE par la recherche de l'en-tête (ensembles, équipe,
 * dépenses du mois) — des listes courtes, déjà chargées en entier.
 */
export function matchesSearch(q: string, ...fields: (string | null | undefined)[]): boolean {
  const needle = normalizeSearch(q);
  if (!needle) return true;
  return fields.some((f) => f && normalizeSearch(f).includes(needle));
}
