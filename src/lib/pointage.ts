/**
 * Pointage — module PUR, partagé par le serveur et le navigateur : types,
 * durées, mois affiché, conversion heure locale ↔ instant. Aucune requête.
 *
 * Une ligne `work_shifts` = UNE journée d'une personne : son arrivée et son
 * départ (index unique `work_shifts_one_per_day`).
 */
import type { IsoDate } from "@/lib/rental-range";

export type Shift = {
  id: number;
  user_id: string;
  clock_in: string;
  clock_out: string | null;
  work_date: IsoDate;
  note: string | null;
  corrected_at: string | null;
};

export const SHIFT_COLUMNS = "id, user_id, clock_in, clock_out, work_date, note, corrected_at";

/** Les onglets du propriétaire. Hors du fichier "use client" (cf. settings-tabs). */
export const POINTAGE_TABS = ["moi", "aujourdhui", "mois"] as const;
export type PointageTab = (typeof POINTAGE_TABS)[number];

export function parsePointageTab(value: string | undefined): PointageTab {
  return POINTAGE_TABS.includes(value as PointageTab) ? (value as PointageTab) : "moi";
}

/**
 * Minutes travaillées. Une période ouverte compte jusqu'à `now` — pour le
 * compteur de l'employé ; les rapports, eux, ne comptent que les périodes
 * closes (`closedMinutes`) : un oubli de départ ne gonfle pas le mois.
 */
export function shiftMinutes(shift: Pick<Shift, "clock_in" | "clock_out">, now = new Date()): number {
  const end = shift.clock_out ? new Date(shift.clock_out) : now;
  return Math.max(0, (end.getTime() - new Date(shift.clock_in).getTime()) / 60_000);
}

export function closedMinutes(shifts: Pick<Shift, "clock_in" | "clock_out">[]): number {
  return shifts.reduce((sum, s) => (s.clock_out ? sum + shiftMinutes(s) : sum), 0);
}

export type MemberMonth = { days: number; minutes: number; open: number };

/** Jours pointés, heures closes et périodes restées ouvertes, par personne. */
export function summarize(shifts: Shift[]): Map<string, MemberMonth> {
  const days = new Map<string, Set<string>>();
  const out = new Map<string, MemberMonth>();
  for (const s of shifts) {
    const row = out.get(s.user_id) ?? { days: 0, minutes: 0, open: 0 };
    const set = days.get(s.user_id) ?? new Set<string>();
    set.add(s.work_date);
    days.set(s.user_id, set);
    if (s.clock_out) row.minutes += shiftMinutes(s);
    else row.open += 1;
    row.days = set.size;
    out.set(s.user_id, row);
  }
  return out;
}

/** « 2026-10 ». Un mois mal formé retombe sur le mois en cours. */
export type Month = `${number}-${number}`;

/**
 * Le mois en cours à Alger. Même calcul que `todayIso` (rental-range), recopié
 * pour que ce module n'importe AUCUNE valeur : `scripts/test-pointage.mjs`
 * le charge sans résolveur d'alias.
 */
export function currentMonth(now: Date = new Date()): Month {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Algiers",
    year: "numeric",
    month: "2-digit",
  })
    .format(now)
    .slice(0, 7) as Month;
}

export function parseMonth(value: string | undefined): Month {
  return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? (value as Month) : currentMonth();
}

export function addMonths(month: Month, delta: number): Month {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}` as Month;
}

/** Premier et dernier jour du mois, bornes incluses. */
export function monthBounds(month: Month): { from: IsoDate; to: IsoDate } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

/** Le 1er du mois à midi : une date sûre à passer à `formatMonthYear`. */
export function monthDate(month: Month): Date {
  return new Date(`${month}-01T12:00:00+01:00`);
}

/**
 * L'Algérie vit à UTC+1 toute l'année (pas d'heure d'été depuis 1981) : une
 * date et une heure saisies à la boutique deviennent un instant sans table
 * de fuseaux.
 */
const ALGIERS_OFFSET = "+01:00";

export function localToInstant(date: IsoDate, time: string): string {
  return new Date(`${date}T${time}:00${ALGIERS_OFFSET}`).toISOString();
}

/** « 08:58 » à l'heure d'Alger — valeur d'un champ de saisie, pas un affichage. */
export function instantToLocalTime(instant: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Africa/Algiers",
  }).format(new Date(instant));
}

/**
 * « 830 » → « 08:30 », « 8h5 » → « 08:05 », « 17:2 » → « 17:02 ». Rend `null`
 * si la saisie n'est pas une heure valide. Le pavé numérique du téléphone n'a
 * pas de deux-points : l'employé tape des chiffres, on range.
 */
export function normalizeTime(raw: string): string | null {
  const value = raw.trim().replace(/[hH.\s]/g, ":");
  let h: number;
  let m: number;
  const parts = value.split(":").filter(Boolean);
  if (parts.length === 2) {
    [h, m] = parts.map(Number);
  } else if (parts.length === 1 && /^\d{1,4}$/.test(parts[0])) {
    const digits = parts[0];
    h = Number(digits.length <= 2 ? digits : digits.slice(0, -2));
    m = digits.length <= 2 ? 0 : Number(digits.slice(-2));
  } else {
    return null;
  }
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return null;
  }
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
