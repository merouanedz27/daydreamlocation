#!/usr/bin/env node
/**
 * Tests du pointage : la période ouverte, les jours payables d'un permanent
 * (calendrier − absences) et d'un remplaçant (présences), le montant à la
 * journée, les jours que l'employé peut toucher.
 *
 *   node --experimental-strip-types scripts/test-pointage.mjs
 *
 * Un jour en trop ou en moins, c'est un jour payé en trop ou oublié sur la
 * paie de l'employé. Ces assertions le verrouillent — et les mêmes exemples
 * sont rejoués côté base dans `supabase/tests/pointage.sql`.
 */
import {
  calendarDays,
  isLocked,
  markKind,
  payAmount,
  periodDays,
  periodStart,
  selfCanToggle,
  workedDays,
} from "../src/lib/pointage.ts";

let failed = 0;
function eq(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? "OK   " : "ECHEC"} ${label}${ok ? "" : ` — attendu ${JSON.stringify(expected)}, obtenu ${JSON.stringify(actual)}`}`);
}

// Début de période.
eq("après une paie : le lendemain", periodStart("2026-10-15", null, "2026-10-20"), "2026-10-16");
eq("paie le 31 : le 1er du mois suivant", periodStart("2026-10-31", null, "2026-11-05"), "2026-11-01");
eq("jamais payé : la date de début", periodStart(null, "2026-09-12", "2026-10-20"), "2026-09-12");
eq("début après la paie : le début gagne", periodStart("2026-09-30", "2026-10-05", "2026-10-20"), "2026-10-05");
eq("paie après le début : la paie gagne", periodStart("2026-09-30", "2026-01-01", "2026-10-20"), "2026-10-01");
eq("ni paie ni début : le 1er du mois", periodStart(null, null, "2026-10-20"), "2026-10-01");
eq("payé aujourd'hui : demain (rien dû)", periodStart("2026-10-20", null, "2026-10-20"), "2026-10-21");

// Jours du calendrier.
eq("octobre entier → 31", calendarDays("2026-10-01", "2026-10-31"), 31);
eq("février entier → 28", calendarDays("2026-02-01", "2026-02-28"), 28);
eq("15 → 31 octobre → 17", calendarDays("2026-10-15", "2026-10-31"), 17);
eq("un seul jour → 1", calendarDays("2026-10-20", "2026-10-20"), 1);
eq("début après la fin → 0", calendarDays("2026-10-21", "2026-10-20"), 0);
eq("à cheval sur l'année", calendarDays("2026-12-20", "2027-01-10"), 12 + 10);

// Jours payables — mêmes règles que pay_worker() (supabase/tests/pointage.sql).
eq("permanent : 10 jours − 3 absences → 7", workedDays("permanent", "2026-10-11", "2026-10-20", 3), 7);
eq("permanent : jamais négatif", workedDays("permanent", "2026-10-19", "2026-10-20", 5), 0);
eq("permanent payé ce soir → 0", workedDays("permanent", "2026-10-21", "2026-10-20", 0), 0);
eq("remplaçant : ses présences seules", workedDays("remplacant", "2026-10-01", "2026-10-20", 4), 4);
eq("permanent coche ses absences", markKind("permanent"), "absence");
eq("remplaçant coche ses présences", markKind("remplacant"), "presence");

// Montant.
eq("7 jours × 1 500", payAmount(1500, 7), 10500);
eq("4 présences × 2 000", payAmount(2000, 4), 8000);
eq("arrondi au dinar", payAmount(833.335, 3), 2500);
eq("aucun jour → 0", payAmount(1500, 0), 0);

// Jours affichés : aujourd'hui en tête, bornes incluses.
eq("jours, aujourd'hui en tête", periodDays("2026-10-18", "2026-10-20"), ["2026-10-20", "2026-10-19", "2026-10-18"]);
eq("à cheval sur deux mois", periodDays("2026-02-27", "2026-03-01"), ["2026-03-01", "2026-02-28", "2026-02-27"]);
eq("mois complet", periodDays("2026-10-01", "2026-10-31").length, 31);

// Jours fermés par la paie.
eq("jour payé fermé", isLocked("2026-10-15", "2026-10-15"), true);
eq("lendemain ouvert", isLocked("2026-10-16", "2026-10-15"), false);
eq("jamais payé : tout ouvert", isLocked("2026-10-01", null), false);

// Ce que l'employé peut toucher (mêmes bornes que mark_absent en base).
const S = "2026-10-16"; // début de période
eq("cocher une absence oubliée", selfCanToggle("2026-10-18", false, "2026-10-20", S, "2026-10-15"), true);
eq("décocher une absence passée : oui", selfCanToggle("2026-10-18", true, "2026-10-20", S, "2026-10-15"), true);
eq("décocher un jour payé : non", selfCanToggle("2026-10-15", true, "2026-10-20", S, "2026-10-15"), false);
eq("décocher aujourd'hui : oui", selfCanToggle("2026-10-20", true, "2026-10-20", S, "2026-10-15"), true);
eq("jour payé : non", selfCanToggle("2026-10-15", false, "2026-10-20", S, "2026-10-15"), false);
eq("demain : non", selfCanToggle("2026-10-21", false, "2026-10-20", S, null), false);
eq("avant le début : non", selfCanToggle("2026-10-10", false, "2026-10-20", "2026-10-12", null), false);

if (failed) {
  console.error(`\n${failed} échec(s).`);
  process.exit(1);
}
console.log("\nTout passe.");
