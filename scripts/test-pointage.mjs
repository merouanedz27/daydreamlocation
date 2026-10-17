#!/usr/bin/env node
/**
 * Tests du pointage : saisie des heures, conversion heure d'Alger ↔ instant,
 * durées affichées, bilan du mois.
 *
 *   node --experimental-strip-types scripts/test-pointage.mjs
 *
 * Une heure mal convertie décale TOUTE une période d'une heure — et le mois
 * entier de l'employé avec. Ces assertions le verrouillent.
 */
import {
  addMonths,
  currentMonth,
  instantToLocalTime,
  localToInstant,
  monthBounds,
  normalizeTime,
  parseMonth,
  summarize,
} from "../src/lib/pointage.ts";
import { formatDuration, formatTime } from "../src/lib/format.ts";

let failed = 0;
function eq(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? "OK   " : "ECHEC"} ${label}${ok ? "" : ` — attendu ${JSON.stringify(expected)}, obtenu ${JSON.stringify(actual)}`}`);
}

// Saisie au pavé numérique.
eq("830 → 08:30", normalizeTime("830"), "08:30");
eq("8 → 08:00", normalizeTime("8"), "08:00");
eq("8h → 08:00", normalizeTime("8h"), "08:00");
eq("8h5 → 08:05", normalizeTime("8h5"), "08:05");
eq("1730 → 17:30", normalizeTime("1730"), "17:30");
eq("17:02 inchangé", normalizeTime("17:02"), "17:02");
eq("25:00 refusé", normalizeTime("25:00"), null);
eq("12:60 refusé", normalizeTime("12:60"), null);
eq("texte refusé", normalizeTime("abc"), null);

// Alger = UTC+1, sans heure d'été.
eq("08:30 Alger → 07:30 UTC", localToInstant("2026-10-17", "08:30"), "2026-10-17T07:30:00.000Z");
eq("été comme hiver", localToInstant("2026-07-01", "08:30"), "2026-07-01T07:30:00.000Z");
eq("aller-retour", instantToLocalTime(localToInstant("2026-10-17", "00:15")), "00:15");
eq("affichage 24 h fr", formatTime("2026-10-17T19:05:00Z", "fr"), "20:05");
eq("affichage 24 h ar, chiffres latins", formatTime("2026-10-17T19:05:00Z", "ar"), "20:05");

// Durées.
eq("fr 7 h 52", formatDuration(472, "fr"), "7 h 52");
eq("fr 7 h 05", formatDuration(425, "fr"), "7 h 05");
eq("fr 8 h", formatDuration(480, "fr"), "8 h");
eq("fr 45 min", formatDuration(45, "fr"), "45 min");
eq("ar 7 س 52 د", formatDuration(472, "ar"), "7 س 52 د");
eq("négatif → 0", formatDuration(-5, "fr"), "0 min");

// Mois.
eq("mois invalide → mois courant", parseMonth("2026-13"), currentMonth());
eq("mois courant à Alger", currentMonth(new Date("2026-10-31T23:30:00Z")), "2026-11");
eq("mois précédent de janvier", addMonths("2026-01", -1), "2025-12");
eq("bornes de février", monthBounds("2028-02"), { from: "2028-02-01", to: "2028-02-29" });

// Bilan : un oubli de départ ne compte pas d'heures, mais il est signalé.
const s = summarize([
  { id: 1, user_id: "a", clock_in: "2026-10-01T07:00:00Z", clock_out: "2026-10-01T11:00:00Z", work_date: "2026-10-01", note: null, corrected_at: null },
  { id: 2, user_id: "a", clock_in: "2026-10-01T12:00:00Z", clock_out: "2026-10-01T15:30:00Z", work_date: "2026-10-01", note: null, corrected_at: null },
  { id: 3, user_id: "a", clock_in: "2026-10-02T07:00:00Z", clock_out: null, work_date: "2026-10-02", note: null, corrected_at: null },
]);
eq("bilan : 2 jours, 7 h 30 closes, 1 ouvert", s.get("a"), { days: 2, minutes: 450, open: 1 });

if (failed) {
  console.error(`\n${failed} échec(s).`);
  process.exit(1);
}
console.log("\nTout passe.");
