/**
 * Pointage — module PUR, partagé par le serveur et le navigateur. Aucune
 * requête, aucune valeur importée : `scripts/test-pointage.mjs` le charge sans
 * résolveur d'alias.
 *
 * Deux façons d'être payé (`profiles.pay_type`) :
 *   permanent  — il vient presque tous les jours : on coche ses ABSENCES ;
 *                jours payés = jours du calendrier de la période − absences.
 *   remplacant — il ne vient que pour remplacer : on coche ses PRÉSENCES ;
 *                jours payés = présences.
 *   montant = jours payés × prix d'une journée, arrondi au dinar.
 * Payer remet le compteur à zéro (`pay_resets`), sans rien effacer.
 *
 * La base fait le même calcul (`pay_worker()`) : c'est elle qui fait foi. Ce
 * module ne sert qu'à l'affichage.
 */
import type { IsoDate } from "@/lib/rental-range";

export const PAY_TYPES = ["permanent", "remplacant"] as const;
/** Les deux valeurs de la contrainte `profiles_pay_type_valid`. */
export type PayType = (typeof PAY_TYPES)[number];

/** Ce que coche la personne : la case de son tableau. */
export type MarkKind = "absence" | "presence";

export function markKind(payType: PayType): MarkKind {
  return payType === "remplacant" ? "presence" : "absence";
}

export function asPayType(value: string | null | undefined): PayType {
  return value === "remplacant" ? "remplacant" : "permanent";
}

export type PayReset = {
  paid_through: IsoDate;
  /** Jours payés. */
  days_count: number;
  /** Prix d'une journée — `null` pour les paies d'avant les montants. */
  daily_rate: number | null;
  amount: number | null;
  absences_count: number | null;
  presences_count: number | null;
  /** `null` pour les paies d'avant les remplaçants. */
  pay_type: string | null;
  created_at: string;
};

/** La période ouverte d'un employé, depuis sa dernière paie. */
export type WorkerPeriod = {
  id: string;
  full_name: string;
  payType: PayType;
  /** Prix d'une journée fixé par l'administrateur (`null` : jamais saisi). */
  dailyRate: number | null;
  /** Premier jour de la période (peut être après aujourd'hui : rien n'est dû). */
  start: IsoDate;
  /** Premier jour de travail saisi par l'administrateur. */
  workStartDate: IsoDate | null;
  /** Jours cochés de la période, dans l'ordre : absences ou présences selon le type. */
  marks: IsoDate[];
  /** Jours du calendrier de la période (permanent : avant les absences). */
  due: number;
  /** Jours payables. */
  worked: number;
  /** Les dernières paies, la plus récente d'abord. */
  resets: PayReset[];
};

function shift(date: IsoDate, days: number): IsoDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

/**
 * Premier jour de la période ouverte : le plus tard du lendemain de la
 * dernière paie et de la date de début de travail ; sans l'un ni l'autre, le
 * 1er du mois. Même règle que `private.period_start()`.
 */
export function periodStart(
  lastPaidThrough: IsoDate | null,
  workStartDate: IsoDate | null,
  today: IsoDate,
): IsoDate {
  const candidates = [lastPaidThrough ? shift(lastPaidThrough, 1) : null, workStartDate].filter(
    (d): d is IsoDate => d !== null,
  );
  return candidates.length ? candidates.sort().at(-1)! : `${today.slice(0, 7)}-01`;
}

/** Jours du calendrier de `from` à `to` inclus ; 0 si `from` est après `to`. */
export function calendarDays(from: IsoDate, to: IsoDate): number {
  return from > to ? 0 : daysBetween(from, to);
}

/**
 * Jours payables de la période — même règle que `pay_worker()` :
 * permanent = calendrier − absences (jamais négatif), remplaçant = présences.
 */
export function workedDays(payType: PayType, start: IsoDate, today: IsoDate, marks: number): number {
  return payType === "remplacant" ? marks : Math.max(calendarDays(start, today) - marks, 0);
}

/** Montant d'une paie, arrondi au dinar — même arrondi que `pay_worker()`. */
export function payAmount(dailyRate: number, worked: number): number {
  return Math.round(dailyRate * worked);
}

/** Les jours de `start` à `today` inclus, AUJOURD'HUI EN TÊTE : la case du pouce. */
export function periodDays(start: IsoDate, today: IsoDate): IsoDate[] {
  const days: IsoDate[] = [];
  for (let d = today; d >= start && days.length < 400; d = shift(d, -1)) days.push(d);
  return days;
}

/**
 * Ce que l'EMPLOYÉ peut toucher (mêmes bornes que `mark_absent()` /
 * `mark_present()` et leurs « unmark » en base) : cocher un jour de sa
 * période, jamais dans le futur ; le décocher tant que le jour n'est pas payé.
 */
export function selfCanToggle(
  day: IsoDate,
  marked: boolean,
  today: IsoDate,
  start: IsoDate,
  lastPaidThrough: IsoDate | null,
): boolean {
  if (isLocked(day, lastPaidThrough)) return false;
  // Une case déjà cochée se retire toujours (mauvais toucher).
  if (marked) return true;
  return day <= today && day >= start;
}

/** Un jour déjà payé ne se modifie plus (même règle que le trigger en base). */
export function isLocked(day: IsoDate, lastPaidThrough: IsoDate | null): boolean {
  return lastPaidThrough !== null && day <= lastPaidThrough;
}

/** Midi à Alger : une date sûre à passer aux fonctions de `format.ts`. */
export function noon(day: IsoDate): string {
  return `${day}T12:00:00+01:00`;
}
