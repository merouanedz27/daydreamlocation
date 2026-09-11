import type { Locale } from "@/i18n/routing";

/**
 * Locales de formatage.
 *
 * `-u-nu-latn` force les chiffres OCCIDENTAUX (0-9) en arabe : c'est l'usage
 * au Maghreb, et l'équipe lit des prix toute la journée. Sans ce suffixe,
 * `ar-DZ` rendrait des chiffres arabes orientaux (٠١٢٣).
 */
const NUMBER_LOCALE: Record<Locale, string> = {
  fr: "fr-DZ",
  ar: "ar-DZ-u-nu-latn",
};

/** Monnaie affichée « DA », comme sur le tableur du client. */
const CURRENCY_SUFFIX = "DA";

/**
 * Séparateur de milliers imposé : espace fine insécable.
 *
 * POURQUOI on ne laisse pas `Intl` décider : `fr-DZ` rend « 7 000 » mais
 * `ar-DZ` rend « 7.000 ». La même équipe, dans la même boutique, verrait
 * deux écritures du même montant selon la langue — et un point se lit comme
 * une virgule décimale. Sur des prix saisis et relus toute la journée, c'est
 * une vraie source d'erreur. On force donc un séparateur unique.
 */
const GROUP_SEPARATOR = " ";

/** Applique le groupement de la locale, puis normalise le séparateur. */
function formatGrouped(
  value: number,
  locale: Locale,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(NUMBER_LOCALE[locale], options)
    .formatToParts(value)
    .map((part) => (part.type === "group" ? GROUP_SEPARATOR : part.value))
    .join("");
}

/**
 * « 7 000 DA ». Pas de décimales : les montants sont en dinars entiers.
 * Ne jamais appeler `Intl` directement dans un composant — passer par ici.
 */
export function formatMoney(amount: number, locale: Locale): string {
  const n = formatGrouped(amount, locale, { maximumFractionDigits: 0 });
  return `${n} ${CURRENCY_SUFFIX}`;
}

/**
 * Toujours `dd/MM/yyyy`, dans les DEUX langues.
 *
 * Le format US `MM/dd` provoquerait de vraies erreurs de réservation :
 * 08/09 lu comme le 8 septembre au lieu du 9 août bloque la mauvaise semaine.
 * On impose donc l'ordre des parties au lieu de laisser `Intl` décider.
 */
export function formatDate(date: Date | string, locale: Locale): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const parts = new Intl.DateTimeFormat(NUMBER_LOCALE[locale], {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Africa/Algiers",
  }).formatToParts(d);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  return `${get("day")}/${get("month")}/${get("year")}`;
}

/** Nombre simple (quantités, compteurs). Même séparateur que les montants. */
export function formatNumber(value: number, locale: Locale): string {
  return formatGrouped(value, locale);
}

/**
 * « 11/09 » — jour et mois, sans l'année.
 *
 * Réservé aux listes DÉJÀ bornées à une période affichée ailleurs (le registre
 * des dépenses, qui porte « Septembre 2026 » en tête). Répéter l'année sur
 * trente lignes coûte un tiers de la largeur d'une colonne de téléphone pour
 * une information que l'écran donne déjà. Partout ailleurs : `formatDate`.
 */
export function formatDayMonth(date: Date | string, locale: Locale): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const parts = new Intl.DateTimeFormat(NUMBER_LOCALE[locale], {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Africa/Algiers",
  }).formatToParts(d);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  return `${get("day")}/${get("month")}`;
}
