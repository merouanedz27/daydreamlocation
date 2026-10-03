import { draftFromOrder, type EditableOrder, type Slot } from "@/lib/quick-draft";

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
  }: {
    slotOf: (label: string) => number | null;
    categoryOfUnit: (unitId: number) => string | null;
  },
): TicketFields {
  const draft = draftFromOrder(order, {
    slotOf,
    categoryOfUnit,
    // Sans effet sur les champs : seule la saisie s'en sert.
    defaultWindow: { pickup: order.pickup_date, returnDue: order.return_due_date },
  });

  // Un costume DU STOCK, c'est une veste et un pantalon, deux pièces : la
  // seconde n'a pas de case à elle. Sa taille va sur « Taille pantalon » (ou
  // « gilet ») au lieu de s'égarer dans les accessoires.
  const [costume, shirt, shoes, accessory, ...extras] = draft.slots;
  let pantsSize = draft.pantsSize;
  let vestSize = draft.vestSize;
  const others: Slot[] = [];
  for (const slot of extras) {
    const slug = slot.unitId ? categoryOfUnit(slot.unitId) : null;
    if (slug === "pantalon" && !pantsSize) pantsSize = slot.size;
    else if (slug === "gilet" && !vestSize) vestSize = slot.size;
    else others.push(slot);
  }

  const piece = (slot: Slot | undefined, withSize = true) => {
    if (!slot?.name) return null;
    const name = slot.ref ? `${slot.name} · ${slot.ref}` : slot.name;
    return withSize && slot.size ? `${name} (${slot.size})` : name;
  };

  return {
    costume: piece(costume, false),
    jacketSize: costume?.name ? costume.size || null : null,
    vestSize: costume?.name ? vestSize || null : null,
    // Pantalon non précisé = même taille que la veste, comme sur son tableur.
    pantsSize: costume?.name ? pantsSize || costume.size || null : null,
    tailor: draft.tailor || null,
    shirt: piece(shirt),
    shoes: piece(shoes),
    accessories: [accessory, ...others].map((s) => piece(s)).filter(Boolean).join(" · ") || null,
  };
}
