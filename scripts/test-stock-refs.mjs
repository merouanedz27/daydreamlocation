#!/usr/bin/env node
/**
 * Tests de la dérivation des références de pièces.
 *
 *   node scripts/test-stock-refs.mjs
 *
 * Cette fonction décide des identifiants que le client lira sur ses cintres
 * pendant des années. Une erreur ici ne casse rien visiblement : elle produit
 * un doublon ou un trou, et se découvre bien plus tard.
 */
import { nextUnitRefs, highestSuffix } from "../src/lib/stock-refs.ts";

let failed = 0;
const check = (label, got, expected) => {
  const g = JSON.stringify(got), e = JSON.stringify(expected);
  const ok = g === e;
  if (!ok) failed++;
  console.log(`${ok ? "OK   " : "ECHEC"} ${label.padEnd(52)} ${ok ? g : `${g} (attendu ${e})`}`);
};

check("stock vide -> premiere piece",
  nextUnitRefs("Gio-079", []), ["Gio-079-01"]);

check("4 pieces existantes -> suivante",
  nextUnitRefs("Gio-079", ["Gio-079-01","Gio-079-02","Gio-079-03","Gio-079-04"]),
  ["Gio-079-05"]);

check("3 exemplaires d'un coup",
  nextUnitRefs("TK-405", ["TK-405-01"], 3),
  ["TK-405-02","TK-405-03","TK-405-04"]);

check("piece supprimee -> PAS de reutilisation du trou",
  nextUnitRefs("Gio-079", ["Gio-079-01","Gio-079-04"]),
  ["Gio-079-05"]);

check("passage a deux chiffres",
  nextUnitRefs("CHM", ["CHM-09"]), ["CHM-10"]);

check("au-dela de 99",
  nextUnitRefs("CHM", ["CHM-99"]), ["CHM-100"]);

check("refs d'un AUTRE modele ignorees",
  nextUnitRefs("TK-405", ["TK-405-P-07","TK-405-01"]),
  ["TK-405-02"]);

check("suffixe non numerique ignore",
  nextUnitRefs("Gio-079", ["Gio-079-01","Gio-079-BIS"]),
  ["Gio-079-02"]);

check("ordre quelconque",
  nextUnitRefs("Gio-079", ["Gio-079-03","Gio-079-01","Gio-079-02"]),
  ["Gio-079-04"]);

check("highestSuffix sur liste vide", highestSuffix("X-", []), 0);

console.log(failed ? `\n${failed} test(s) en echec` : "\nTous les tests passent");
process.exit(failed ? 1 : 0);
