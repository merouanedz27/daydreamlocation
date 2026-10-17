#!/usr/bin/env node
/**
 * Tests du pointage par cases : la période ouverte depuis la dernière paie,
 * les jours affichés, les jours fermés.
 *
 *   node --experimental-strip-types scripts/test-pointage.mjs
 *
 * Un jour en trop ou en moins dans la période, c'est un jour payé en trop ou
 * oublié sur la paie de l'employé. Ces assertions le verrouillent.
 */
import { isLocked, periodDays, periodStart } from "../src/lib/pointage.ts";

let failed = 0;
function eq(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? "OK   " : "ECHEC"} ${label}${ok ? "" : ` — attendu ${JSON.stringify(expected)}, obtenu ${JSON.stringify(actual)}`}`);
}

// Début de période.
eq("après une paie : le lendemain", periodStart("2026-10-15", "2026-10-02", "2026-10-20"), "2026-10-16");
eq("paie le 31 : le 1er du mois suivant", periodStart("2026-10-31", null, "2026-11-05"), "2026-11-01");
eq("jamais payé : le premier jour coché", periodStart(null, "2026-09-28", "2026-10-20"), "2026-09-28");
eq("nouvel employé : le 1er du mois", periodStart(null, null, "2026-10-20"), "2026-10-01");
eq("payé aujourd'hui : la ligne du jour reste", periodStart("2026-10-20", null, "2026-10-20"), "2026-10-20");

// Jours affichés : aujourd'hui en tête, bornes incluses.
eq("jours, aujourd'hui en tête", periodDays("2026-10-18", "2026-10-20"), ["2026-10-20", "2026-10-19", "2026-10-18"]);
eq("à cheval sur deux mois", periodDays("2026-02-27", "2026-03-01"), ["2026-03-01", "2026-02-28", "2026-02-27"]);
eq("un seul jour", periodDays("2026-10-20", "2026-10-20"), ["2026-10-20"]);
eq("mois complet", periodDays("2026-10-01", "2026-10-31").length, 31);

// Jours fermés par la paie.
eq("jour payé fermé", isLocked("2026-10-15", "2026-10-15"), true);
eq("lendemain ouvert", isLocked("2026-10-16", "2026-10-15"), false);
eq("jamais payé : tout ouvert", isLocked("2026-10-01", null), false);

if (failed) {
  console.error(`\n${failed} échec(s).`);
  process.exit(1);
}
console.log("\nTout passe.");
