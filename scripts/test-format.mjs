#!/usr/bin/env node
/**
 * Tests de l'affichage des montants, des nombres et des dates.
 *
 *   node --experimental-strip-types scripts/test-format.mjs
 *
 * POURQUOI CETTE SUITE EXISTE
 *
 * Un prix est la chaîne la plus lue du produit, et la plus silencieuse quand
 * elle casse. `npm run verify` est passé au vert alors que CHAQUE montant en
 * arabe s'affichait « 11 300 [object Object] » : le compilateur accepte
 * n'importe quel type dans un gabarit de chaîne, et ESLint ne dit rien. Seul
 * un rendu réel l'a montré. Ces assertions ferment ce trou.
 *
 * Ce qui est vérifié tient en trois idées, chacune déjà payée une fois :
 *   1. l'unité monétaire s'écrit dans la langue de l'utilisateur ;
 *   2. les chiffres restent LATINS en arabe, et le séparateur de milliers est
 *      le même dans les deux langues — sinon la même équipe lit deux
 *      écritures du même montant selon la langue ;
 *   3. la date est toujours `jj/MM/aaaa`, jamais l'ordre américain.
 */
import {
  formatMoney,
  formatNumber,
  formatDate,
  formatDayMonth,
} from "../src/lib/format.ts";
import { isAlgerianMobile, normalizePhone } from "../src/lib/phone.ts";

let failed = 0;
const check = (label, got, expected) => {
  const ok = got === expected;
  if (!ok) failed++;
  console.log(
    `${ok ? "OK   " : "ECHEC"} ${label.padEnd(58)} ${ok ? got : `${got} (attendu ${expected})`}`,
  );
};

// Espace INSÉCABLE entre le nombre et son unité : un montant ne doit jamais se
// couper en fin de ligne. C'est le même caractère que dans `format.ts`.
const NB = "\u00A0";
// Séparateur de milliers : espace FINE insécable (U+202F), imposée par
// `format.ts` pour que « 11 300 » s'écrive pareil en français et en arabe.
const TH = "\u202F";

/* --- montants ----------------------------------------------------------- */

check("montant en francais", formatMoney(7000, "fr"), `7${TH}000${NB}DA`);
check("montant en arabe", formatMoney(7000, "ar"), `7${TH}000${NB}دج`);

// Le garde-fou de la panne qui a motivé cette suite.
check(
  "aucun montant ne contient [object Object]",
  [formatMoney(1, "fr"), formatMoney(1, "ar")].some((s) => s.includes("[object")),
  false,
);

check("zero reste un montant", formatMoney(0, "ar"), `0${NB}دج`);
check("montant negatif garde son signe", formatMoney(-4100, "fr"), `-4${TH}100${NB}DA`);
// Les prix sont en dinars entiers : pas de centimes affichés.
check("pas de decimales", formatMoney(5400.49, "fr"), `5${TH}400${NB}DA`);
check("pas de decimales (arabe)", formatMoney(5400.49, "ar"), `5${TH}400${NB}دج`);

/* --- chiffres latins et separateur unique -------------------------------- */

// Sans `-u-nu-latn`, `ar-DZ` rendrait ٠١٢٣ ; sans le separateur impose,
// `ar-DZ` rendrait « 11.300 » — un point qui se lit comme une virgule.
check("chiffres latins en arabe", formatNumber(11300, "ar"), `11${TH}300`);
check("meme separateur qu en francais", formatNumber(11300, "fr"), `11${TH}300`);
check(
  "aucun chiffre arabe oriental",
  /[\u0660-\u0669]/.test(formatMoney(1234567, "ar")),
  false,
);

/* --- dates --------------------------------------------------------------- */

// 08/09 lu a l americaine bloquerait la mauvaise semaine de mariage.
check("date en francais", formatDate("2026-09-08", "fr"), "08/09/2026");
check("meme ordre en arabe", formatDate("2026-09-08", "ar"), "08/09/2026");
// La boutique vit a Alger (UTC+1) : a 23h30 UTC on est deja le lendemain.
check(
  "fuseau d Alger applique",
  formatDate("2026-09-11T23:30:00Z", "ar"),
  "12/09/2026",
);
check("jour et mois seuls", formatDayMonth("2026-12-05", "ar"), "05/12");

/* --- telephone ----------------------------------------------------------- */

// Trois ecritures du meme numero doivent donner la meme chaine enregistree :
// sinon la recherche par telephone ne retrouve plus le client.
check("espaces retires", normalizePhone("0551 23 45 67"), "0551234567");
check("tirets et points retires", normalizePhone("0551-23.45.67"), "0551234567");
check("indicatif +213 replie", normalizePhone("+213 551 23 45 67"), "0551234567");
check("indicatif 00213 replie", normalizePhone("00213551234567"), "0551234567");
check("mobile 05 accepte", isAlgerianMobile("0551234567"), true);
check("mobile 06 accepte", isAlgerianMobile("0661234567"), true);
check("mobile 07 accepte", isAlgerianMobile("0771234567"), true);
check("fixe 021 refuse", isAlgerianMobile("021234567"), false);
check("chiffre manquant refuse", isAlgerianMobile("055123456"), false);
check("autre indicatif refuse", isAlgerianMobile(normalizePhone("+33612345678")), false);
check("vide refuse", isAlgerianMobile(normalizePhone("")), false);

console.log(failed ? `\n${failed} test(s) en echec` : "\nTous les tests passent");
process.exit(failed ? 1 : 0);
