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

/**
 * Découpe `text` en morceaux, en marquant ceux qui correspondent à `q` — pour
 * SURLIGNER le terme cherché dans une liste. Même règle que la recherche :
 * sans casse ni accents (« helene » trouve « Hélène »), mais le texte rendu
 * reste l'ORIGINAL, accents compris.
 *
 * Aucune expression régulière n'est construite à partir de la saisie : on
 * compare des chaînes, rien à échapper. Un terme d'une seule lettre ne
 * surligne rien — il éclairerait toute la liste.
 */
export function highlightParts(text: string, q: string | null | undefined): { text: string; hit: boolean }[] {
  const needle = normalizeSearch(q ?? "");
  if (needle.length < 2 || !text) return [{ text, hit: false }];
  // Voie rapide : la plupart des lignes ne contiennent PAS le terme. Un seul
  // test suffit alors, sans repli caractère par caractère.
  if (!normalizeSearch(text).includes(needle)) return [{ text, hit: false }];

  // Texte replié caractère par caractère, avec pour chaque caractère replié
  // l'indice du caractère ORIGINAL dont il vient.
  let folded = "";
  const origin: number[] = [];
  let i = 0;
  for (const char of text) {
    const f = char.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    for (let k = 0; k < f.length; k++) origin.push(i);
    folded += f;
    i += char.length;
  }
  origin.push(text.length);

  const parts: { text: string; hit: boolean }[] = [];
  let cursor = 0;
  let from = folded.indexOf(needle);
  while (from !== -1) {
    const start = origin[from];
    const end = origin[from + needle.length];
    if (start > cursor) parts.push({ text: text.slice(cursor, start), hit: false });
    if (end > start) parts.push({ text: text.slice(start, end), hit: true });
    cursor = Math.max(cursor, end);
    from = folded.indexOf(needle, from + needle.length);
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), hit: false });
  return parts.length ? parts : [{ text, hit: false }];
}
