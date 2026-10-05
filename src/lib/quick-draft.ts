/**
 * Le brouillon de la saisie rapide — module PUR, partagé par le formulaire
 * (navigateur) et la page de modification (serveur), qui en fabrique un à
 * partir d'une commande existante.
 *
 * Une commande se saisit comme une LIGNE de son AppSheet : quatre cases fixes
 * (costume, chemise, chaussures, accessoires), puis des pièces en plus si
 * besoin. Chaque case est un vêtement nommé, ou une pièce du STOCK — la seule
 * qui bloque des dates.
 */

export type Slot = {
  name: string;
  size: string;
  /** Renseigné = pièce du STOCK choisie dans la liste. */
  unitId: number | null;
  ref: string | null;
  stockPrice: number | null;
  /**
   * Pièce SOUS-LOUÉE chez un confrère, reprise d'une commande existante. La
   * saisie rapide n'en crée pas, mais une modification ne doit pas la
   * transformer en vêtement ordinaire et perdre ce qu'elle a coûté.
   */
  external?: { source: string | null; cost: number | null } | null;
};

export type QuickDraft = {
  v: 2;
  customerName: string;
  customerPhone: string;
  eventDate: string;
  pickup: string;
  returnDue: string;
  datesTouched: boolean;
  /** 0 costume, 1 chemise, 2 chaussures, 3 accessoires, puis les pièces en plus. */
  slots: Slot[];
  /** Tailles du costume au-delà de la veste (case 0) : « Taille Gelly » et pantalon. */
  vestSize: string;
  pantsSize: string;
  tailor: string;
  /** « Allez valide » / « Retour valide » de son formulaire AppSheet. */
  pickedUp: boolean;
  returned: boolean;
  price: string;
  /** Prix tapé à la main : on ne le recalcule plus depuis le stock. */
  priceTouched: boolean;
  paid: string;
  caution: string;
  notes: string;
};

export const EMPTY_SLOT: Slot = {
  name: "",
  size: "",
  unitId: null,
  ref: null,
  stockPrice: null,
  external: null,
};
export const FIXED_SLOTS = 4;
export const ACCESSORIES_SLOT = 3;

export const EMPTY_DRAFT: QuickDraft = {
  v: 2,
  customerName: "",
  customerPhone: "",
  eventDate: "",
  pickup: "",
  returnDue: "",
  datesTouched: false,
  slots: [EMPTY_SLOT, EMPTY_SLOT, EMPTY_SLOT, EMPTY_SLOT],
  vestSize: "",
  pantsSize: "",
  tailor: "",
  pickedUp: false,
  returned: false,
  price: "",
  priceTouched: false,
  paid: "",
  caution: "",
  notes: "",
};

/**
 * « 50 · G 48 · P 52 » — veste, gilet, pantalon dans la seule colonne taille
 * de la ligne du costume. Le pantalon n'est écrit que s'il DIFFÈRE de la
 * veste : « 50 » seul veut dire veste et pantalon en 50, comme sur son tableur.
 */
export function costumeSize(jacket: string, vest: string, pants: string): string | null {
  const j = jacket.trim();
  const parts = [j];
  if (vest.trim()) parts.push(`G ${vest.trim()}`);
  if (pants.trim() && pants.trim() !== j) parts.push(`P ${pants.trim()}`);
  return parts.filter(Boolean).join(" · ") || null;
}

/** L'inverse de `costumeSize` : « 50 · G 48 · P 52 » → 50 / 48 / 52. */
export function splitCostumeSize(size: string | null): {
  jacket: string;
  vest: string;
  pants: string;
} {
  const out = { jacket: "", vest: "", pants: "" };
  for (const part of (size ?? "").split("·").map((p) => p.trim()).filter(Boolean)) {
    if (/^G\s/.test(part)) out.vest = part.slice(2).trim();
    else if (/^P\s/.test(part)) out.pants = part.slice(2).trim();
    else out.jacket = out.jacket ? `${out.jacket} · ${part}` : part;
  }
  return out;
}

/** Catégories du stock → case de la saisie (0 costume … 3 accessoires). */
const CATEGORY_SLOT: Record<string, number> = {
  costume: 0,
  veste: 0,
  pantalon: 0,
  gilet: 0,
  chemise: 1,
  chaussures: 2,
  bligha: 2,
  noeud: 3,
  accessoire: 3,
  barnous: 3,
};

export type EditableOrder = {
  customer_name: string;
  customer_phone: string | null;
  event_date: string;
  pickup_date: string;
  return_due_date: string;
  picked_up: boolean;
  returned: boolean;
  total_price: number;
  amount_paid: number;
  caution_amount: number;
  notes: string | null;
  order_lines: {
    unit_id: number | null;
    model_name_snapshot: string | null;
    size_snapshot: string | null;
    line_note: string | null;
    external_label: string | null;
    external_source: string | null;
    external_cost: number | null;
    article_units: { ref_code: string } | null;
  }[];
};

/**
 * Une commande existante, remise dans les cases du formulaire.
 *
 * Une commande ne retient PAS dans quelle case chaque pièce avait été saisie :
 * on la retrouve. Pièce du stock → par sa catégorie ; vêtement nommé → par la
 * case où ce libellé est d'habitude saisi (`slotOf`) ; sinon, dans l'ordre,
 * la case libre suivante — la saisie rapide enregistre les cases dans l'ordre.
 * Ce qui ne trouve pas de case devient une pièce en plus : rien n'est perdu.
 */
export function draftFromOrder(
  order: EditableOrder,
  {
    slotOf,
    categoryOfUnit,
    defaultWindow,
  }: {
    /** Case habituelle d'un libellé (1 tenue … 4 accessoires), si connue. */
    slotOf: (label: string) => number | null;
    /** Slug de catégorie d'une pièce du stock, si connue. */
    categoryOfUnit: (unitId: number) => string | null;
    /** La fenêtre que l'application aurait déduite de la date de l'événement. */
    defaultWindow: { pickup: string; returnDue: string };
  },
): QuickDraft {
  const slots: Slot[] = [EMPTY_SLOT, EMPTY_SLOT, EMPTY_SLOT, EMPTY_SLOT].map((s) => ({ ...s }));
  const extra: Slot[] = [];
  let tailor = "";
  let vestSize = "";
  let pantsSize = "";
  let cursor = 0;

  for (const line of order.order_lines) {
    const name = (line.model_name_snapshot ?? line.external_label ?? "").trim();
    if (!name) continue;

    let preferred: number | null = null;
    if (line.unit_id) {
      const slug = categoryOfUnit(line.unit_id);
      preferred = slug ? (CATEGORY_SLOT[slug] ?? null) : null;
    } else if (!line.external_label) {
      const hint = slotOf(name);
      preferred = hint ? Math.min(hint, 4) - 1 : null;
    }

    let index: number | null = null;
    if (preferred !== null && !slots[preferred].name) index = preferred;
    else if (preferred === null) {
      for (let i = cursor; i < slots.length; i++) {
        if (!slots[i].name) {
          index = i;
          break;
        }
      }
    }

    const slot: Slot = {
      name,
      size: line.size_snapshot ?? "",
      unitId: line.unit_id,
      ref: line.article_units?.ref_code ?? null,
      // Le prix d'une pièce du stock n'est utile qu'au calcul automatique,
      // éteint ici : le prix de la commande est repris tel quel.
      stockPrice: null,
      external: line.external_label
        ? { source: line.external_source, cost: line.external_cost }
        : null,
    };

    // « Tailleur » : la note portée par une pièce (la saisie la met sur le
    // costume). Les notes de plusieurs pièces se rejoignent plutôt que de se
    // perdre.
    if (line.line_note?.trim()) {
      tailor = tailor ? `${tailor} · ${line.line_note.trim()}` : line.line_note.trim();
    }

    if (index === null) {
      extra.push(slot);
      continue;
    }
    if (index === 0 && !line.unit_id) {
      const sizes = splitCostumeSize(line.size_snapshot);
      slot.size = sizes.jacket;
      vestSize = sizes.vest;
      pantsSize = sizes.pants;
    }
    slots[index] = slot;
    cursor = Math.max(cursor, index + 1);
  }

  return {
    ...EMPTY_DRAFT,
    customerName: order.customer_name,
    customerPhone: order.customer_phone ?? "",
    eventDate: order.event_date,
    pickup: order.pickup_date,
    returnDue: order.return_due_date,
    // Fenêtre retouchée à la main : un changement de date de l'événement ne
    // doit pas l'écraser en silence.
    datesTouched:
      order.pickup_date !== defaultWindow.pickup ||
      order.return_due_date !== defaultWindow.returnDue,
    slots: [...slots, ...extra],
    vestSize,
    pantsSize,
    tailor,
    pickedUp: order.picked_up,
    returned: order.returned,
    price: String(order.total_price),
    priceTouched: true,
    paid: order.amount_paid ? String(order.amount_paid) : "",
    caution: order.caution_amount ? String(order.caution_amount) : "",
    notes: order.notes ?? "",
  };
}
