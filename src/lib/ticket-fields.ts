import {
  draftFromOrder,
  splitCostumeSize,
  type EditableOrder,
  type Slot,
} from "@/lib/quick-draft";

/**
 * Les champs d'une commande tels que son AppSheet les présentait — costume,
 * tailles, tailleur, chemise, chaussures, accessoires —, partagés par le bon
 * de location et l'e-mail « Nouvelle commande » : les deux disent la même
 * chose, calculée au même endroit. Module PUR.
 *
 * Les pièces sont remises dans les cases de la saisie exactement comme le
 * formulaire de modification les retrouve (`draftFromOrder`).
 */
export type TicketFields = {
  costume: string | null;
  jacketSize: string | null;
  vestSize: string | null;
  pantsSize: string | null;
  tailor: string | null;
  shirt: string | null;
  shoes: string | null;
  accessories: string | null;
};

export function ticketFields(
  order: EditableOrder,
  {
    slotOf,
    categoryOfUnit,
    hideRefs = {},
  }: {
    slotOf: (label: string) => number | null;
    categoryOfUnit: (unitId: number) => string | null;
    /** Colonnes affichées SANS la référence — la liste des commandes. */
    hideRefs?: { costume?: boolean; shoes?: boolean };
  },
): TicketFields {
  const draft = draftFromOrder(order, {
    slotOf,
    categoryOfUnit,
    // Sans effet sur les champs : seule la saisie s'en sert.
    defaultWindow: { pickup: order.pickup_date, returnDue: order.return_due_date },
  });

  // Le costume : une case par partie — veste, gilet, pantalon.
  const [jacket, vest, pants, shirt, shoes, accessory, ...extras] = draft.slots;
  // Costume NOMMÉ, d'avant les cases par partie : toutes ses tailles tiennent
  // dans la case de la veste, « 50 · G 48 · P 52 ».
  const legacy = jacket?.name && !jacket.unitId ? splitCostumeSize(jacket.size) : null;
  let jacketSize = legacy ? legacy.jacket : (jacket?.name ? jacket.size : "");
  let vestSize = legacy ? legacy.vest : (vest?.name ? vest.size : "");
  // Pantalon non précisé = même taille que la veste, comme sur son tableur.
  let pantsSize = legacy ? legacy.pants || legacy.jacket : (pants?.name ? pants.size : "");

  // Une seconde partie de costume (deux pantalons…) donne sa taille si la
  // sienne manque, au lieu de s'égarer dans les accessoires.
  const others: Slot[] = [];
  for (const slot of extras) {
    const slug = slot.unitId ? categoryOfUnit(slot.unitId) : null;
    if (slug === "pantalon" && !pantsSize) pantsSize = slot.size;
    else if (slug === "gilet" && !vestSize) vestSize = slot.size;
    else if (slug === "veste" && !jacketSize) jacketSize = slot.size;
    else others.push(slot);
  }

  const piece = (slot: Slot | undefined, withSize = true, withRef = true) => {
    if (!slot?.name) return null;
    const name = withRef && slot.ref ? `${slot.name} · ${slot.ref}` : slot.name;
    return withSize && slot.size ? `${name} (${slot.size})` : name;
  };
  const costume = [jacket, vest, pants].map((s) => piece(s, false, !hideRefs.costume)).filter(Boolean).join(" · ");

  return {
    costume: costume || null,
    jacketSize: jacketSize || null,
    vestSize: vestSize || null,
    pantsSize: pantsSize || null,
    tailor: draft.tailor || null,
    shirt: piece(shirt),
    shoes: piece(shoes, true, !hideRefs.shoes),
    accessories: [accessory, ...others].map((s) => piece(s)).filter(Boolean).join(" · ") || null,
  };
}
