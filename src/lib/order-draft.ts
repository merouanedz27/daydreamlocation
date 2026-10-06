/**
 * Le brouillon de commande, côté navigateur.
 *
 * Une commande n'a PAS de colonnes fixes (veste / pantalon / chemise /
 * chaussures comme dans le tableur) : c'est une liste libre. Le client prend la
 * veste du Costume n°12 avec la chemise du n°7 — c'est le cas d'usage qui a
 * motivé toute l'application. On ajoute donc des lignes, autant qu'on veut,
 * dans n'importe quel ordre.
 */

import type { PickerModel, PickerUnit } from "@/lib/queries/orders";

export type DraftLine =
  | {
      kind: "unit";
      unitId: number;
      unitPrice: number;
      note: string | null;
      /* Champs d'AFFICHAGE seulement : le serveur relit les instantanés en
         base, il ne fait jamais confiance à ce que le navigateur envoie. */
      modelName: string;
      refCode: string;
      size: string | null;
    }
  | {
      /** Vêtement nommé hors stock — la saisie rapide, comme le tableur. */
      kind: "named";
      name: string;
      size: string | null;
      unitPrice: number;
      note: string | null;
    }
  | {
      kind: "external";
      source: string | null;
      label: string;
      cost: number | null;
      unitPrice: number;
      note: string | null;
    };

/**
 * Résolution du prix, niveaux 2 et 3 sur 4.
 *
 *   forfait ensemble  ->  prix spécifique à la pièce  ->  prix du modèle
 *   ->  prix négocié par l'employé sur la ligne
 *
 * Les deux premiers niveaux se décident ici ; le forfait ensemble passe par la
 * remise de la commande (voir `packageDiscount`), et le dernier niveau est le
 * champ « Prix » de chaque ligne, toujours modifiable.
 */
export function resolveUnitPrice(model: PickerModel, unit: PickerUnit): number {
  if (unit.price_override !== null) return unit.price_override;
  // Une PARTIE de costume louée seule : son prix à elle. Le costume complet,
  // lui, se loue au prix du modèle (voir `setPrice`).
  if (unit.part) {
    const part = model.parts.find((p) => p.part === unit.part);
    if (part) return part.rent_price;
  }
  return model.base_price;
}

export function linesSubtotal(lines: DraftLine[]): number {
  return lines.reduce((sum, l) => sum + (Number.isFinite(l.unitPrice) ? l.unitPrice : 0), 0);
}

/**
 * Un ensemble pris entier vaut son forfait. Plutôt que d'écraser le prix des
 * lignes — ce qui rendrait l'historique illisible et se battrait avec le
 * trigger qui recalcule `subtotal` depuis les lignes — on porte l'écart dans
 * la REMISE de la commande. Chaque ligne garde ainsi son vrai prix.
 */
export function packageDiscount(
  packagePrice: number,
  ensembleLinesTotal: number,
): number {
  return Math.max(ensembleLinesTotal - packagePrice, 0);
}

export function unitIdsIn(lines: DraftLine[]): Set<number> {
  return new Set(
    lines.filter((l): l is Extract<DraftLine, { kind: "unit" }> => l.kind === "unit")
      .map((l) => l.unitId),
  );
}

/** Ce qui part réellement au serveur : sans les champs d'affichage. */
export function toPayload(lines: DraftLine[]) {
  return lines.map((l) => {
    switch (l.kind) {
      case "unit":
        return { kind: "unit" as const, unitId: l.unitId, unitPrice: l.unitPrice, note: l.note ?? undefined };
      case "named":
        return {
          kind: "named" as const,
          name: l.name,
          size: l.size ?? undefined,
          unitPrice: l.unitPrice,
          note: l.note ?? undefined,
        };
      case "external":
        return {
          kind: "external" as const,
          source: l.source ?? undefined,
          label: l.label,
          cost: l.cost,
          unitPrice: l.unitPrice,
          note: l.note ?? undefined,
        };
    }
  });
}

/**
 * Le PRIX DE LA TENUE, comme dans le tableur : un seul montant pour toute la
 * commande, RÉPARTI sur ses pièces au prorata de leur prix catalogue
 * (`weights`) — la veste à 8 000 et le pantalon à 4 000 d'un costume vendu
 * 12 000 portent chacun leur part, et non 12 000 / 0. Une pièce sans prix
 * (vêtement nommé, hors stock) reçoit 0.
 *
 * La somme des lignes vaut TOUJOURS le prix saisi, au dinar près : l'arrondi
 * restant va à la pièce la plus chère. Les parts sont rondes (à la centaine)
 * quand le prix l'est. Sans aucun poids, tout reste sur la
 * première ligne (la règle de la reprise du tableur). Le trigger
 * `orders_recompute_totals` refait la somme de toute façon.
 */
export function spreadOutfitPrice<T extends { unitPrice: number }>(
  lines: T[],
  total: number,
  weights: number[] = [],
): T[] {
  const amount = Math.max(Math.round(total), 0);
  const w = lines.map((_, i) => Math.max(weights[i] ?? 0, 0));
  const sum = w.reduce((a, b) => a + b, 0);
  if (!sum) return lines.map((l, i) => ({ ...l, unitPrice: i === 0 ? amount : 0 }));

  // Des parts rondes (à la centaine) quand le prix l'est : 6 900, pas 6 858.
  const step = amount % 100 === 0 ? 100 : 1;
  const shares = w.map((x) => Math.floor((amount * x) / sum / step) * step);
  const heaviest = w.indexOf(Math.max(...w));
  shares[heaviest] += amount - shares.reduce((a, b) => a + b, 0);
  return lines.map((l, i) => ({ ...l, unitPrice: shares[i] }));
}
