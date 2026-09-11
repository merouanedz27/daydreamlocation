#!/usr/bin/env node
/**
 * Tests des plages de location.
 *
 *   node --experimental-strip-types scripts/test-rental-range.mjs
 *
 * Ce module est le MIROIR JavaScript de `private.rental_range_for`. S'il
 * diverge, l'écran de saisie grise les mauvaises pièces : soit il en propose
 * une déjà louée (la base refusera, mais l'employé aura promis au client), soit
 * il en cache une qui était libre. Les deux se paient un samedi de mariage.
 *
 * Les cas de bornes viennent de `supabase/tests/availability.sql`, pour que les
 * deux suites racontent la même histoire.
 */
import {
  addDays,
  todayIso,
  daysBetween,
  defaultWindow,
  rentalRange,
  parseDateRange,
  rangeContains,
  freeFrom,
  rangesOverlap,
} from "../src/lib/rental-range.ts";

let failed = 0;
const check = (label, got, expected) => {
  const g = JSON.stringify(got), e = JSON.stringify(expected);
  const ok = g === e;
  if (!ok) failed++;
  console.log(`${ok ? "OK   " : "ECHEC"} ${label.padEnd(58)} ${ok ? g : `${g} (attendu ${e})`}`);
};

/* --- date du jour a Alger ---------------------------------------------- */

// Alger est a UTC+1 toute l'annee (pas d'heure d'ete depuis 1981). Le serveur,
// lui, tourne en UTC : c'est exactement la fenetre ou les deux ne sont pas le
// meme jour.
check("23h30 UTC : Alger est deja le lendemain",
  todayIso(new Date("2026-09-11T23:30:00Z")), "2026-09-12");
check("00h30 UTC : Alger est le meme jour",
  todayIso(new Date("2026-09-12T00:30:00Z")), "2026-09-12");
check("minuit pile UTC, dernier jour du mois",
  todayIso(new Date("2026-09-30T23:00:00Z")), "2026-10-01");

/* --- arithmétique de dates --------------------------------------------- */

check("addDays simple", addDays("2026-08-26", 1), "2026-08-27");
check("addDays recule", addDays("2026-08-26", -1), "2026-08-25");
check("addDays franchit un mois", addDays("2026-08-31", 1), "2026-09-01");
check("addDays franchit une annee", addDays("2026-12-31", 1), "2027-01-01");
// 2028 est bissextile : le 29 fevrier doit exister.
check("addDays annee bissextile", addDays("2028-02-28", 1), "2028-02-29");
check("addDays annee non bissextile", addDays("2027-02-28", 1), "2027-03-01");
check("daysBetween", daysBetween("2026-08-25", "2026-08-29"), 4);

/* --- fenetre par defaut : miroir de orders_default_window --------------- */

check("fenetre par defaut J-1 / J+1",
  defaultWindow("2026-08-26", 1, 1),
  { pickup: "2026-08-25", returnDue: "2026-08-27" });

check("fenetre elargie J-2 / J+3",
  defaultWindow("2026-08-26", 2, 3),
  { pickup: "2026-08-24", returnDue: "2026-08-29" });

/* --- plage bloquee : miroir de private.rental_range_for ----------------- */

// L'exemple du plan : evenement le 26, retrait le 25, retour le 27,
// 1 jour de nettoyage => bloque du 25 inclus au 29 exclu.
check("plage avec 1 jour de nettoyage",
  rentalRange("2026-08-25", "2026-08-27", 1), "[2026-08-25,2026-08-29)");

check("plage sans nettoyage",
  rentalRange("2026-08-25", "2026-08-27", 0), "[2026-08-25,2026-08-28)");

check("plage avec 3 jours de nettoyage",
  rentalRange("2026-08-25", "2026-08-27", 3), "[2026-08-25,2026-08-31)");

/* --- lecture d'une plage ----------------------------------------------- */

check("parse borne basse incluse, haute exclue",
  parseDateRange("[2026-08-25,2026-08-29)"),
  { lower: "2026-08-25", upper: "2026-08-29",
    lowerInclusive: true, upperInclusive: false });

check("parse plage nulle", parseDateRange(null), null);
check("parse chaine invalide", parseDateRange("n'importe quoi"), null);

check("contient le premier jour", rangeContains("[2026-08-25,2026-08-29)", "2026-08-25"), true);
check("contient un jour du milieu", rangeContains("[2026-08-25,2026-08-29)", "2026-08-27"), true);
check("exclut la borne haute", rangeContains("[2026-08-25,2026-08-29)", "2026-08-29"), false);
check("exclut la veille", rangeContains("[2026-08-25,2026-08-29)", "2026-08-24"), false);

/* --- « libre le ... » --------------------------------------------------- */

check("libre a la borne haute exclusive",
  freeFrom("[2026-08-25,2026-08-29)"), "2026-08-29");
check("libre au lendemain d'une borne inclusive",
  freeFrom("[2026-08-25,2026-08-29]"), "2026-08-30");
check("libre sur plage nulle", freeFrom(null), null);

/* --- chevauchement : la regle que la base applique ---------------------- */

check("chevauchement franc",
  rangesOverlap("[2026-08-25,2026-08-29)", "[2026-08-27,2026-08-31)"), true);

// LE cas limite : rendue le 27 + 1 jour de nettoyage => relouable le 29.
check("contigu SANS chevauchement (relouable le jour meme)",
  rangesOverlap("[2026-08-25,2026-08-29)", "[2026-08-29,2026-09-02)"), false);

check("chevauchement d'un seul jour",
  rangesOverlap("[2026-08-25,2026-08-29)", "[2026-08-28,2026-09-01)"), true);

check("plages disjointes",
  rangesOverlap("[2026-08-25,2026-08-29)", "[2026-09-10,2026-09-14)"), false);

check("plage incluse dans l'autre",
  rangesOverlap("[2026-08-25,2026-09-05)", "[2026-08-27,2026-08-29)"), true);

check("chevauchement symetrique",
  rangesOverlap("[2026-08-27,2026-08-31)", "[2026-08-25,2026-08-29)"), true);

check("plage vide ne chevauche rien",
  rangesOverlap("[2026-08-25,2026-08-25)", "[2026-08-25,2026-08-29)"), false);

console.log(failed ? `\n${failed} test(s) en echec` : "\nTous les tests passent");
process.exit(failed ? 1 : 0);
