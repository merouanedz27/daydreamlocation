import {
  draftFromOrder,
  splitCostumeSize,
  tailorSummary,
  type EditableOrder,
  type Slot,
} from "@/lib/quick-draft";

/**
 * Les champs d'une commande tels que son AppSheet les présentait — costume,
 * tailles, tailleur, chemise, jabador, chaussures, accessoires —, partagés par le bon
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
  jabador: string | null;
  shoes: string | null;
  accessories: string | null;
};

export function ticketFields(
  order: EditableOrder,
  {
    slotOf,
    categoryOfUnit,
    withRefs = true,
    hideRefs = {},
  }: {
    slotOf: (label: string) => number | null;
    categoryOfUnit: (unitId: number) => string | null;
    /**
     * `false` : aucune référence, sur aucune pièce — le bon de location, où
     * le client ne veut lire que les noms (« Gio-079 », pas « Gio-079-01 »).
     */
    withRefs?: boolean;
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
  const [jacket, vest, pants, shirt, jabador, shoes, accessory, ...extras] = draft.slots;
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
    const name = withRefs && withRef && slot.ref ? `${slot.name} · ${slot.ref}` : slot.name;
    return withSize && slot.size ? `${name} (${slot.size})` : name;
  };
  const costume = [jacket, vest, pants].map((s) => piece(s, false, !hideRefs.costume)).filter(Boolean).join(" · ");

  return {
    costume: costume || null,
    jacketSize: jacketSize || null,
    vestSize: vestSize || null,
    pantsSize: pantsSize || null,
    tailor: tailorSummary(draft.slots) || null,
    shirt: piece(shirt),
    jabador: piece(jabador),
    shoes: piece(shoes, true, !hideRefs.shoes),
    accessories: [accessory, ...others].map((s) => piece(s)).filter(Boolean).join(" · ") || null,
  };
}

/** Le type de pièce d'une ligne du tableau du bon (ARTICLE). */
export type TicketPart =
  | "jacket"
  | "vest"
  | "pants"
  | "shirt"
  | "jabador"
  | "shoes"
  | "accessory";

export type TicketItem = { part: TicketPart; model: string; size: string | null };

/** Les cases fixes de la saisie, dans l'ordre (`QuickDraft.slots`). */
const SLOT_PARTS: TicketPart[] = [
  "jacket",
  "vest",
  "pants",
  "shirt",
  "jabador",
  "shoes",
  "accessory",
];

/** Catégorie du stock d'une pièce en plus → sa ligne sur le bon. */
const CATEGORY_PART: Record<string, TicketPart> = {
  veste: "jacket",
  costume: "jacket",
  gilet: "vest",
  pantalon: "pants",
  chemise: "shirt",
  jabador: "jabador",
  chaussures: "shoes",
};

/**
 * Les pièces d'une commande en LIGNES du tableau Article / Modèle / Taille du
 * bon de location — une par pièce, rangées comme les cases de la saisie
 * (`draftFromOrder`). Jamais de référence : le client lit des noms.
 * `costume` : le(s) modèle(s) du costume, pour l'en-tête du ticket client.
 */
export function ticketItems(
  order: EditableOrder,
  {
    slotOf,
    categoryOfUnit,
  }: {
    slotOf: (label: string) => number | null;
    categoryOfUnit: (unitId: number) => string | null;
  },
): { costume: string | null; items: TicketItem[] } {
  const draft = draftFromOrder(order, {
    slotOf,
    categoryOfUnit,
    defaultWindow: { pickup: order.pickup_date, returnDue: order.return_due_date },
  });

  const items: TicketItem[] = [];
  draft.slots.forEach((slot, index) => {
    const model = slot.name.trim();
    if (!model) return;
    const size = slot.size.trim() || null;

    // Costume NOMMÉ, d'avant les cases par partie : « 50 · G 48 · P 52 » dans
    // la case de la veste devient trois lignes du même modèle — pantalon non
    // précisé = taille de la veste, comme `ticketFields`.
    if (index === 0 && !slot.unitId && size) {
      const split = splitCostumeSize(size);
      items.push({ part: "jacket", model, size: split.jacket || null });
      if (split.vest) items.push({ part: "vest", model, size: split.vest });
      items.push({ part: "pants", model, size: split.pants || split.jacket || null });
      return;
    }

    const slug = slot.unitId ? categoryOfUnit(slot.unitId) : null;
    const part =
      SLOT_PARTS[index] ?? (slug ? CATEGORY_PART[slug] : undefined) ?? "accessory";
    items.push({ part, model, size });
  });

  const costumeModels = [
    ...new Set(
      items
        .filter((i) => i.part === "jacket" || i.part === "vest" || i.part === "pants")
        .map((i) => i.model),
    ),
  ];
  return { costume: costumeModels.join(" · ") || null, items };
}
