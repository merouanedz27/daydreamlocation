/**
 * Plages de location — MIROIR EXACT des fonctions SQL.
 *
 * La disponibilité est garantie par la base : la contrainte `EXCLUDE` sur
 * `order_lines` refuse deux lignes actives qui portent la même pièce sur des
 * plages qui se chevauchent. Le JavaScript ne décide rien ; il sert seulement à
 * GRISER une pièce dans l'écran de saisie et à dire quand elle se libère.
 *
 * Mais pour interroger la base il faut construire la plage candidate, et cette
 * formule vit déjà en SQL (`private.rental_range_for`). La dupliquer à la main
 * dans un composant est exactement l'erreur qui nous a coûté cher sur les
 * références de pièces : deux dérivations divergentes, l'employé voit une chose
 * et en obtient une autre. D'où ce module unique, testé
 * (`scripts/test-rental-range.mjs`).
 *
 * SOURCE DE VÉRITÉ SQL — garder les deux en phase :
 *
 *   private.rental_range_for(pickup, return_due)
 *     = daterange(pickup, return_due + 1 + cleaning_buffer_days, '[)')
 *
 *   public.orders_default_window()
 *     pickup     = event_date - days_before_event
 *     return_due = event_date + days_after_event
 *
 * Toutes les dates sont des chaînes `YYYY-MM-DD`. On travaille en UTC de bout
 * en bout : `new Date("2026-08-26")` est minuit UTC, et un décalage horaire
 * négatif ferait reculer la date d'un jour — un mariage décalé d'une journée.
 */

/** Une date `YYYY-MM-DD`. Pas de type branded : le coût dépasserait le gain. */
export type IsoDate = string;

const DAY_MS = 86_400_000;

function toUtc(date: IsoDate): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Décale une date d'un nombre de jours, sans piège de fuseau. */
export function addDays(date: IsoDate, days: number): IsoDate {
  return fromUtc(toUtc(date) + days * DAY_MS);
}

/**
 * Date du jour TELLE QUE LA BOUTIQUE LA VIT, en `YYYY-MM-DD`.
 *
 * Surtout pas `new Date().toISOString()` : Vercel fait tourner le serveur en
 * UTC, et Alger est à UTC+1. Entre 23 h et minuit, heure d'Alger, un serveur
 * UTC est encore la veille — l'écran annoncerait « retrait demain » le matin
 * même du retrait. Le paramètre `now` n'existe que pour rendre la fonction
 * testable ; l'appel normal se fait sans argument.
 *
 * `en-CA` est choisie pour une seule raison : c'est la locale qui rend
 * naturellement l'ordre année-mois-jour attendu ici.
 */
export function todayIso(now: Date = new Date()): IsoDate {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Algiers",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Nombre de jours de `from` à `to` (négatif si `to` précède `from`). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/**
 * Fenêtre par défaut déduite de la seule date saisie par le client.
 * Miroir de `public.orders_default_window`.
 */
export function defaultWindow(
  eventDate: IsoDate,
  daysBefore: number,
  daysAfter: number,
): { pickup: IsoDate; returnDue: IsoDate } {
  return {
    pickup: addDays(eventDate, -daysBefore),
    returnDue: addDays(eventDate, daysAfter),
  };
}

/**
 * Plage réellement bloquée par une pièce, au format littéral Postgres.
 * Miroir de `private.rental_range_for`.
 *
 * Borne haute EXCLUSIVE : une pièce rendue le 27 avec 1 jour de battement est
 * relouable le 29. `[27,29)` chevauche donc `[28,30)` mais pas `[29,31)`.
 */
export function rentalRange(
  pickup: IsoDate,
  returnDue: IsoDate,
  cleaningBufferDays: number,
): string {
  return `[${pickup},${addDays(returnDue, 1 + cleaningBufferDays)})`;
}

export type DateRange = {
  lower: IsoDate;
  upper: IsoDate;
  lowerInclusive: boolean;
  upperInclusive: boolean;
};

/** `[2026-08-25,2026-08-29)` — borne basse incluse, borne haute exclue. */
export function parseDateRange(range: string | null): DateRange | null {
  if (!range) return null;
  const m = range.match(/^([[(])([^,]*),([^)\]]*)([)\]])$/);
  if (!m) return null;
  const [, lowBracket, lower, upper, highBracket] = m;
  if (!lower || !upper) return null; // plage infinie : hors de notre domaine
  return {
    lower,
    upper,
    lowerInclusive: lowBracket === "[",
    upperInclusive: highBracket === "]",
  };
}

export function rangeContains(range: string | null, day: IsoDate): boolean {
  const r = parseDateRange(range);
  if (!r) return false;
  const afterLow = r.lowerInclusive ? day >= r.lower : day > r.lower;
  const beforeHigh = r.upperInclusive ? day <= r.upper : day < r.upper;
  return afterLow && beforeHigh;
}

/**
 * Premier jour où la pièce redevient louable.
 *
 * C'est ce qu'on affiche sous une pièce grisée — « libre le 29/08 » vaut
 * beaucoup mieux qu'un simple « indisponible » : l'employé peut proposer une
 * date au client au lieu de raccrocher.
 */
export function freeFrom(range: string | null): IsoDate | null {
  const r = parseDateRange(range);
  if (!r) return null;
  return r.upperInclusive ? addDays(r.upper, 1) : r.upper;
}

/** Deux plages se chevauchent-elles ? Même sémantique que `&&` en Postgres. */
export function rangesOverlap(a: string | null, b: string | null): boolean {
  const ra = parseDateRange(a);
  const rb = parseDateRange(b);
  if (!ra || !rb) return false;

  // Normalisé en [début, fin) : comparer devient trivial.
  const startA = ra.lowerInclusive ? ra.lower : addDays(ra.lower, 1);
  const endA = ra.upperInclusive ? addDays(ra.upper, 1) : ra.upper;
  const startB = rb.lowerInclusive ? rb.lower : addDays(rb.lower, 1);
  const endB = rb.upperInclusive ? addDays(rb.upper, 1) : rb.upper;

  if (startA >= endA || startB >= endB) return false; // plage vide
  return startA < endB && startB < endA;
}
