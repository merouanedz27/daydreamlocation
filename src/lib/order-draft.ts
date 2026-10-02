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
  return unit.price_override ?? model.base_price;
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
 * commande. Il est porté par la première ligne, les autres à zéro — la règle
 * de la reprise du tableur. La somme des lignes vaut ainsi le prix saisi, ce
 * que le trigger `orders_recompute_totals` recalcule de toute façon.
 */
export function spreadOutfitPrice<T extends { unitPrice: number }>(lines: T[], total: number): T[] {
  return lines.map((l, i) => ({ ...l, unitPrice: i === 0 ? Math.max(total, 0) : 0 }));
}
