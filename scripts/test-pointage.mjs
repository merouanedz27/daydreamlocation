#!/usr/bin/env node
/**
 * Tests du pointage par absences : la période ouverte, les jours dus mois par
 * mois, le montant, les jours que l'employé peut toucher.
 *
 *   node --experimental-strip-types scripts/test-pointage.mjs
 *
 * Un jour en trop ou en moins, c'est un jour payé en trop ou oublié sur la
 * paie de l'employé. Ces assertions le verrouillent — et les mêmes exemples
 * sont rejoués côté base dans `supabase/tests/pointage.sql`.
 */
import {
  daysDue,
  isLocked,
  payAmount,
  periodDays,
  periodStart,
  selfCanToggle,
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

// Jours dus, N = 30.
eq("octobre entier (31 j) → 30", daysDue("2026-10-01", "2026-10-31", 30), 30);
eq("février entier (28 j) → 30", daysDue("2026-02-01", "2026-02-28", 30), 30);
eq("15 → 31 octobre → 17", daysDue("2026-10-15", "2026-10-31", 30), 17);
eq("15 sept → 31 oct → 16 + 30", daysDue("2026-09-15", "2026-10-31", 30), 46);
eq("1er → 20 octobre → 20", daysDue("2026-10-01", "2026-10-20", 30), 20);
eq("un seul jour → 1", daysDue("2026-10-20", "2026-10-20", 30), 1);
eq("début après la fin → 0", daysDue("2026-10-21", "2026-10-20", 30), 0);
eq("à cheval sur l'année", daysDue("2026-12-20", "2027-01-10", 30), 12 + 10);
// N = 28.
eq("N=28 : octobre entier → 28", daysDue("2026-10-01", "2026-10-31", 28), 28);
eq("N=28 : 1er → 30 octobre plafonné → 28", daysDue("2026-10-01", "2026-10-30", 28), 28);
eq("N=28 : trois mois entiers → 84", daysDue("2026-08-01", "2026-10-31", 28), 84);

// Montant.
eq("mois complet sans absence : le salaire", payAmount(30000, 30, 30), 30000);
eq("2 absences sur 30", payAmount(30000, 28, 30), 28000);
eq("arrondi au dinar", payAmount(25000, 17, 30), 14167);

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
