/**
 * Pointage — module PUR, partagé par le serveur et le navigateur. Aucune
 * requête, aucune valeur importée : `scripts/test-pointage.mjs` le charge sans
 * résolveur d'alias.
 *
 * Le modèle du client : une CASE par jour, cochée en arrivant à la boutique.
 * Le compteur d'un employé = ses jours cochés depuis sa dernière paie ; payer
 * le remet à zéro (`pay_resets`), sans rien effacer.
 */
import type { IsoDate } from "@/lib/rental-range";

export type PayReset = { paid_through: IsoDate; days_count: number; created_at: string };

/** La période ouverte d'un employé : ses cases cochées depuis la dernière paie. */
export type WorkerPeriod = {
  id: string;
  full_name: string;
  /** Premier jour de la période affichée. */
  start: IsoDate;
  /** Jours cochés de la période. */
  checked: IsoDate[];
  /** Les dernières paies, la plus récente d'abord. */
  resets: PayReset[];
};

function shift(date: IsoDate, days: number): IsoDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Premier jour de la période ouverte :
 *   - le lendemain de la dernière paie ;
 *   - sinon le premier jour coché ;
 *   - sinon le 1er du mois — un nouvel employé voit le mois en cours.
 * Jamais après aujourd'hui : payé ce soir, la ligne du jour reste visible
 * (fermée) jusqu'à demain.
 */
export function periodStart(
  lastPaidThrough: IsoDate | null,
  firstChecked: IsoDate | null,
  today: IsoDate,
): IsoDate {
  const start = lastPaidThrough
    ? shift(lastPaidThrough, 1)
    : (firstChecked ?? `${today.slice(0, 7)}-01`);
  return start > today ? today : start;
}

/** Les jours de `start` à `today` inclus, AUJOURD'HUI EN TÊTE : la case du pouce. */
export function periodDays(start: IsoDate, today: IsoDate): IsoDate[] {
  const days: IsoDate[] = [];
  for (let d = today; d >= start && days.length < 400; d = shift(d, -1)) days.push(d);
  return days;
}

/** Un jour déjà payé ne se coche plus (même règle que le trigger en base). */
export function isLocked(day: IsoDate, lastPaidThrough: IsoDate | null): boolean {
  return lastPaidThrough !== null && day <= lastPaidThrough;
}

/** Midi à Alger : une date sûre à passer aux fonctions de `format.ts`. */
export function noon(day: IsoDate): string {
  return `${day}T12:00:00+01:00`;
}
