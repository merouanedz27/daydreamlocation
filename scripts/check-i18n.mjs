#!/usr/bin/env node
/**
 * Vérifie que `messages/fr.json` et `messages/ar.json` ont exactement les
 * mêmes clés.
 *
 * Une clé présente d'un seul côté ne casse pas le build : elle produit
 * silencieusement un libellé manquant, en production, dans une seule des deux
 * langues — donc typiquement celle que le développeur ne relit pas.
 */
import { readFileSync } from "node:fs";
import { exit } from "node:process";

const flat = (o, p = "") =>
  Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === "object" ? flat(v, `${p}${k}.`) : [`${p}${k}`],
  );

const read = (f) => new Set(flat(JSON.parse(readFileSync(f, "utf8"))));
const fr = read("messages/fr.json");
const ar = read("messages/ar.json");

const missingAr = [...fr].filter((k) => !ar.has(k)).sort();
const missingFr = [...ar].filter((k) => !fr.has(k)).sort();

if (!missingAr.length && !missingFr.length) {
  console.log(`i18n OK — ${fr.size} clés, identiques en fr et ar.`);
  exit(0);
}

if (missingAr.length) console.error("Manquantes dans ar.json :\n  " + missingAr.join("\n  "));
if (missingFr.length) console.error("Manquantes dans fr.json :\n  " + missingFr.join("\n  "));
exit(1);
