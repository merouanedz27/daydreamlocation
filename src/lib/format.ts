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

/**
 * Monnaie, dans l'écriture de chaque langue : « DA » en français comme sur le
 * tableur du client, « دج » en arabe.
 *
 * On n'utilise PAS `style: "currency"` d'`Intl` : il rendrait « د.ج.‏ » avec
 * ses points et sa marque de direction invisible, et surtout il placerait le
 * symbole AVANT le nombre en arabe. Le loueur écrit le montant puis l'unité,
 * dans les deux langues — c'est son geste, et la colonne de prix doit rester
 * lisible de haut en bas.
 *
 * Le sens d'affichage se règle tout seul : les chiffres latins forment un îlot
 * neutre dans un paragraphe arabe, donc « 7 000 دج » se lit bien de droite à
 * gauche sans aucune marque de direction.
 */
export const CURRENCY_SUFFIX: Record<Locale, string> = {
  fr: "DA",
  ar: "دج",
};

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
 * « 7 000 DA », « 7 000 دج ». Pas de décimales : les montants sont en dinars
 * entiers.
 * Ne jamais appeler `Intl` directement dans un composant — passer par ici.
 */
export function formatMoney(amount: number, locale: Locale): string {
  const n = formatGrouped(amount, locale, { maximumFractionDigits: 0 });
  return `${n} ${CURRENCY_SUFFIX[locale]}`;
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

/**
 * « vendredi 3 octobre » / « الجمعة 3 أكتوبر » — le jour en toutes lettres,
 * pour les titres d'écran (« Demain », la vue Jour du calendrier). Pas
 * d'année : le titre parle d'un jour proche, l'année n'apporte rien.
 */
export function formatLongDay(date: Date | string, locale: Locale): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(NUMBER_LOCALE[locale], {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Africa/Algiers",
  }).format(d);
}

/** « octobre 2026 » — en-tête du calendrier mensuel. */
export function formatMonthYear(date: Date | string, locale: Locale): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(NUMBER_LOCALE[locale], {
    month: "long",
    year: "numeric",
    timeZone: "Africa/Algiers",
  }).format(d);
}

/** Initiale du jour de la semaine (« lun. », « ن ») — en-tête de colonnes. */
export function formatWeekdayShort(date: Date | string, locale: Locale): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(NUMBER_LOCALE[locale], {
    weekday: "short",
    timeZone: "Africa/Algiers",
  }).format(d);
}

/**
 * « 08:58 » — heure de pointage, toujours sur 24 h et à l'heure d'Alger,
 * dans les deux langues : « 8:58 PM » ne se lit pas dans une boutique.
 */
export function formatTime(date: Date | string, locale: Locale): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(NUMBER_LOCALE[locale], {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Africa/Algiers",
  }).format(d);
}

/** Unités d'une durée, comme `CURRENCY_SUFFIX` : le nombre, puis l'unité. */
const DURATION_UNITS: Record<Locale, { h: string; min: string }> = {
  fr: { h: "h", min: "min" },
  ar: { h: "س", min: "د" },
};

/**
 * « 7 h 52 », « 45 min », « 8 h » — durée de travail, en minutes entières.
 * Les minutes gardent deux chiffres (« 7 h 05 ») : une colonne d'heures se
 * relit d'un coup d'œil.
 */
export function formatDuration(minutes: number, locale: Locale): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  const u = DURATION_UNITS[locale];
  if (h === 0) return `${m} ${u.min}`;
  if (m === 0) return `${formatGrouped(h, locale)} ${u.h}`;
  const mm = String(m).padStart(2, "0");
  return locale === "fr" ? `${formatGrouped(h, locale)} ${u.h} ${mm}` : `${h} ${u.h} ${mm} ${u.min}`;
}
