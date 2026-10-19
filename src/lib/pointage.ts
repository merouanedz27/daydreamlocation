/**
 * Pointage — module PUR, partagé par le serveur et le navigateur. Aucune
 * requête, aucune valeur importée : `scripts/test-pointage.mjs` le charge sans
 * résolveur d'alias.
 *
 * Le modèle du client : on coche les ABSENCES, pas les présences — l'équipe
 * vient presque tous les jours. À la paie :
 *   jours dus   = un mois entier vaut N jours (réglage, 30 par défaut), un
 *                 mois partiel ses jours réels (au plus N) ;
 *   jours payés = jours dus − absences ;
 *   montant     = salaire mensuel × jours payés ÷ N.
 * Payer remet le compteur à zéro (`pay_resets`), sans rien effacer.
 *
 * La base fait le même calcul (`private.days_due`, `pay_worker()`) : c'est
 * elle qui fait foi. Ce module ne sert qu'à l'affichage.
 */
import type { IsoDate } from "@/lib/rental-range";

export type PayReset = {
  paid_through: IsoDate;
  /** Jours payés. */
  days_count: number;
  /** Prix d'une journée — `null` pour les paies d'avant les montants. */
  daily_rate: number | null;
  amount: number | null;
  /** `null` pour les paies d'avant le salaire mensuel. */
  monthly_salary: number | null;
  month_days: number | null;
  absences_count: number | null;
  created_at: string;
};

/** La période ouverte d'un employé, depuis sa dernière paie. */
export type WorkerPeriod = {
  id: string;
  full_name: string;
  /** Premier jour de la période (peut être après aujourd'hui : rien n'est dû). */
  start: IsoDate;
  /** Premier jour de travail saisi par l'administrateur. */
  workStartDate: IsoDate | null;
  /** Jours d'absence de la période, dans l'ordre. */
  absences: IsoDate[];
  /** Jours dus sur la période, avant les absences. */
  due: number;
  /** Jours payables : `due − absences`, jamais négatif. */
  worked: number;
  /** Les dernières paies, la plus récente d'abord. */
  resets: PayReset[];
};

function shift(date: IsoDate, days: number): IsoDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function lastDayOfMonth(monthStart: IsoDate): IsoDate {
  const d = new Date(`${monthStart}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1, 0);
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

/**
 * Jours dus de `from` à `to` inclus, mois par mois : un mois entier vaut `n`,
 * un mois partiel ses jours réels, au plus `n`. Miroir de `private.days_due`.
 */
export function daysDue(from: IsoDate, to: IsoDate, n: number): number {
  let total = 0;
  for (let month = `${from.slice(0, 7)}-01`; month <= to; month = shift(lastDayOfMonth(month), 1)) {
    const last = lastDayOfMonth(month);
    if (month >= from && last <= to) total += n;
    else total += Math.min(daysBetween(month < from ? from : month, last > to ? to : last), n);
  }
  return from > to ? 0 : total;
}

/** Montant d'une paie, arrondi au dinar — même arrondi que `pay_worker()`. */
export function payAmount(monthlySalary: number, worked: number, n: number): number {
  return Math.round((monthlySalary * worked) / n);
}

/** Les jours de `start` à `today` inclus, AUJOURD'HUI EN TÊTE : la case du pouce. */
export function periodDays(start: IsoDate, today: IsoDate): IsoDate[] {
  const days: IsoDate[] = [];
  for (let d = today; d >= start && days.length < 400; d = shift(d, -1)) days.push(d);
  return days;
}

/**
 * Ce que l'EMPLOYÉ peut toucher (mêmes bornes que `mark_absent()` /
 * `unmark_absent()` en base) : cocher une absence d'un jour de sa période,
 * jamais dans le futur ; la décocher tant que le jour n'est pas payé.
 */
export function selfCanToggle(
  day: IsoDate,
  absent: boolean,
  today: IsoDate,
  start: IsoDate,
  lastPaidThrough: IsoDate | null,
): boolean {
  if (isLocked(day, lastPaidThrough)) return false;
  // Une absence déjà cochée se retire toujours (mauvais toucher).
  if (absent) return true;
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
