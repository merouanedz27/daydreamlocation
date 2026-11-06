"use client";

import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { flushSync } from "react-dom";
import { unstable_rethrow, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertCircle,
  AlertTriangle,
  CalendarRange,
  CircleCheck,
  Eraser,
  Package,
  Plane,
  Plus,
  Scissors,
  X,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { DatePicker, toCalendarDate } from "@/components/date-picker";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  FlagToggle,
  MoneyStepper,
  RequiredMark,
  Section,
} from "@/components/order-form-parts";
import {
  SuggestInput,
  focusNextField,
  normalizeSearch,
  type SuggestOption,
} from "@/components/suggest-input";
import {
  ListPicker,
  NEW_KEY,
  PickerField,
  SizePicker,
  type PickerOption,
} from "@/components/list-picker";
import {
  checkAvailability,
  createOrder,
  updateOrder,
} from "@/lib/actions/orders";
import {
  resolveUnitPrice,
  spreadOutfitPrice,
  toPayload,
  unitIdsIn,
  type DraftLine,
} from "@/lib/order-draft";
import { isNetworkError, localAvailability, queueOp } from "@/lib/offline/outbox";
import { fieldErrorsOf, orderSchema } from "@/lib/validation/orders";
import { defaultWindow } from "@/lib/rental-range";
import { createMemoryStore } from "@/lib/device-setting";
import {
  ACCESSORIES_SLOT,
  EMPTY_DRAFT,
  EMPTY_SLOT,
  FIXED_SLOTS,
  JABADOR_SLOT,
  SHOES_SLOT,
  SHIRT_SLOT,
  catalogSlotOf,
  costumeSize,
  partOfSlot,
  type QuickDraft,
  type Slot,
} from "@/lib/quick-draft";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import {
  ORDER_SHIRT_SIZES,
  SUIT_SIZES,
  labelHasSize,
  sizeInLabel,
  sizeSeries,
  sortSizes,
} from "@/lib/sizes";
import { HighlightText } from "@/components/highlight";
import type {
  CustomerSuggestion,
  ItemSuggestion,
  PickerModel,
  Settings,
  Unavailability,
} from "@/lib/queries/orders";
import type { Locale } from "@/i18n/routing";

/* --------------------------------------------------------------------------
 * Le brouillon — une LIGNE DU TABLEUR.
 *
 * Sept cases fixes (veste, gilet, pantalon, chemise, jabador, chaussures, accessoires),
 * les colonnes de son AppSheet, puis des pièces en plus si besoin. Chaque case est du texte
 * libre ; une suggestion du stock la RATTACHE à une pièce réelle, qui seule
 * bloque des dates.
 *
 * Types et règles du brouillon : `src/lib/quick-draft.ts`.
 *
 * Gardé dans le téléphone (`localStorage`) à chaque frappe : un appel client
 * au milieu de la saisie ne fait rien perdre. En MODIFICATION, le brouillon
 * vit en mémoire et part de la commande en base (voir `edit`).
 * ------------------------------------------------------------------------ */

function sanitizeQuickDraft(value: unknown): QuickDraft | null {
  if (!value || typeof value !== "object") return null;
  const d = value as Omit<Partial<QuickDraft>, "v"> & { v?: number };
  if (!Array.isArray(d.slots)) return null;
  let slots = d.slots.map((s) => ({ ...EMPTY_SLOT, ...s }));
  if (d.v === 1) {
    // Brouillon d'avant la case « Accessoires » : trois cases fixes, puis
    // les pièces en plus. On insère la nouvelle case à sa place plutôt que
    // de jeter une saisie en cours.
    if (slots.length < 3) return null;
    slots = [...slots.slice(0, 3), EMPTY_SLOT, ...slots.slice(3)];
  } else if (d.v !== 2 && d.v !== 3 && d.v !== 4) {
    return null;
  }
  // v1 et v2 SEULEMENT. Écrit `d.v !== 3`, ce bloc s'appliquait aussi aux
  // brouillons v4 : chaque rechargement insérait deux cases vides après la
  // veste, et chaussures / accessoires glissaient en « Autre pièce » — des
  // champs en double, un de plus à chaque visite.
  if (d.v === 1 || d.v === 2) {
    // Brouillon d'avant les cases par partie : une seule case « Costume »,
    // ses tailles gilet / pantalon à part. Un costume nommé les reprend
    // dans sa taille (« 50 · G 48 · P 52 ») ; gilet et pantalon arrivent vides.
    if (slots.length < 4) return null;
    const old = d as { vestSize?: string; pantsSize?: string };
    const [jacket, ...rest] = slots;
    const size =
      jacket.name && !jacket.unitId
        ? (costumeSize(jacket.size, old.vestSize ?? "", old.pantsSize ?? "") ??
          "")
        : jacket.size;
    slots = [{ ...jacket, size }, EMPTY_SLOT, EMPTY_SLOT, ...rest];
  }
  // v3 avait six cases fixes. Le Jabador devient la nouvelle case 4 :
  // les chaussures et accessoires sont donc conservés mais décalés.
  if (d.v !== 4) {
    if (slots.length < 6) return null;
    slots = [
      ...slots.slice(0, JABADOR_SLOT),
      EMPTY_SLOT,
      ...slots.slice(JABADOR_SLOT),
    ];
  }
  if (slots.length < FIXED_SLOTS) return null;
  // Les pièces en plus restées vides n'ont rien à garder — et cela nettoie
  // les brouillons déjà gonflés par le bug ci-dessus.
  slots = slots.filter((s, i) => i < FIXED_SLOTS || s.name.trim());
  // Brouillon d'avant les retouches par pièce : la note « Tailleur » unique
  // va sur la première pièce saisie, comme la saisie l'enregistrait.
  const { tailor: legacyTailor, ...rest } = d as typeof d & { tailor?: unknown };
  if (typeof legacyTailor === "string" && legacyTailor.trim()) {
    const first = slots.findIndex((s) => s.name.trim());
    if (first >= 0 && !slots[first].alteration) {
      slots[first] = {
        ...slots[first],
        alteration: { id: null, note: legacyTailor.trim(), done: false },
      };
    }
  }
  return { ...EMPTY_DRAFT, ...rest, v: 4, slots };
}

/**
 * Store local au formulaire: son premier snapshot est toujours EMPTY_DRAFT.
 * Ainsi un brouillon mémoire/HMR v3 ne peut pas participer à l'hydratation.
 */
function createQuickDraftStore() {
  let current = EMPTY_DRAFT;
  let hydrated = false;
  const listeners = new Set<() => void>();

  function hydrate() {
    if (hydrated) return;
    hydrated = true;
    try {
      current =
        sanitizeQuickDraft(
          JSON.parse(localStorage.getItem("dd.quickOrder") ?? "null"),
        ) ?? EMPTY_DRAFT;
    } catch {
      current = EMPTY_DRAFT;
    }
    for (const listener of listeners) listener();
  }

  function subscribe(onChange: () => void) {
    listeners.add(onChange);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== "dd.quickOrder") return;
      hydrated = false;
      hydrate();
      onChange();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(onChange);
      window.removeEventListener("storage", onStorage);
    };
  }

  return {
    get: () => (hydrated ? current : EMPTY_DRAFT),
    hydrate,
    set(next: QuickDraft) {
      current = next;
      hydrated = true;
      try {
        localStorage.setItem("dd.quickOrder", JSON.stringify(next));
      } catch {
        /* le brouillon vaut pour la session, faute de mieux. */
      }
      for (const listener of listeners) listener();
    },
    useValue() {
      return useSyncExternalStore(
        subscribe,
        () => (hydrated ? current : EMPTY_DRAFT),
        () => EMPTY_DRAFT,
      );
    },
  };
}

/** Tant que le prix n'est pas tapé à la main, il vaut la somme des pièces du stock. */
function withAutoPrice(d: QuickDraft): QuickDraft {
  if (d.priceTouched) return d;
  const sum = d.slots.reduce(
    (s, slot) => s + (slot.unitId ? (slot.stockPrice ?? 0) : 0),
    0,
  );
  return { ...d, price: sum > 0 ? String(sum) : "" };
}

function isDirty(d: QuickDraft): boolean {
  return (
    Boolean(
      d.customerName || d.customerPhone || d.eventDate || d.price,
    ) ||
    Boolean(d.paid || d.caution || d.notes) ||
    d.pickedUp ||
    d.returned ||
    d.slots.some((s) => s.name || s.size || s.alteration?.note)
  );
}

type FieldIssue = {
  key: string;
  values?: Record<string, string>;
  /** Développement seulement : l'erreur brute, sous le message. */
  detail?: string;
};
type Issues = Partial<Record<string, FieldIssue>>;

/** Ordre À L'ÉCRAN : on ramène l'employé sur le premier champ fautif. */
const FIELD_TARGETS = [
  ["customer_name", "q-name"],
  ["customer_phone", "q-phone"],
  ["event_date", "q-date"],
  ["pickup_date", "q-pickup"],
  ["return_due_date", "q-return"],
  ["part_0", "q-slot-0"],
  ["part_1", "q-slot-1"],
  ["part_2", "q-slot-2"],
  ["part_3", "q-slot-3"],
  ["part_4", "q-slot-4"],
  ["lines", "q-slot-0"],
  ["price", "q-price"],
  ["amount_paid", "q-paid"],
  ["caution_amount", "q-caution"],
  ["notes", "q-notes"],
] as const;

const EMPTY_BUSY = new Map<number, Unavailability>();

/**
 * Catégories du stock montrées d'office dans chaque case (numérotée comme
 * `slot` des suggestions : 2 chemise, 3 jabador, 4 chaussures, 5 accessoires). Les
 * parties du costume ont leurs propres cases, qui ne montrent que la leur.
 */
const SLOT_CATEGORIES: Record<number, string[]> = {
  2: ["chemise"],
  3: ["jabador"],
  4: ["chaussures", "bligha"],
  5: ["noeud", "accessoire", "barnous"],
};

/**
 * Cases qui ne proposent QUE leurs pièces du stock — ni les vêtements déjà
 * saisis à la main, ni un nouveau tapé dans la recherche (demande du client
 * pour les chaussures).
 */
const STOCK_ONLY_SLOTS = new Set([4]);

const MAX_SUGGESTIONS = 6;

/**
 * Saisie rapide d'une commande — l'écran pensé contre AppSheet.
 *
 * Le client trouvait l'ancien formulaire plus lent que son tableur : il fallait
 * choisir chaque pièce dans le stock (encore vide), et saisir téléphone,
 * versement et caution même à zéro. Ici une commande se tape comme une ligne
 * du tableur — nom, date, costume, chemise, chaussures, un prix — avec en plus
 * ce que le tableur ne sait pas faire : retrouver un client déjà venu, proposer
 * les vêtements déjà tapés, et enchaîner les commandes sans quitter l'écran.
 */
export function OrderQuickForm({
  models,
  items,
  customers,
  settings,
  edit,
}: {
  models: PickerModel[];
  items: ItemSuggestion[];
  customers: CustomerSuggestion[];
  settings: Settings;
  /**
   * MODIFICATION d'une commande existante : même écran, mêmes gestes que la
   * saisie — c'est ce que fait son AppSheet en rouvrant une ligne.
   *
   * `version` : celle de la commande au chargement (`orders.version`). La
   * base refuse l'enregistrement si un collègue l'a changée entre-temps — en
   * ligne comme hors ligne — au lieu d'écraser son ✈ ou son encaissement.
   */
  edit?: { orderId: number; orderNo: string; initial: QuickDraft; version: number };
}) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const router = useRouter();
  const partLabel = (part: string | null) =>
    part ? t(`stock.parts.${part}`) : "";
  const slotLabel = (index: number) =>
    partOfSlot(index)
      ? partLabel(partOfSlot(index))
      : index === SHIRT_SLOT
        ? t("orders.quick.shirt")
        : index === JABADOR_SLOT
          ? t("orders.quick.jabador")
          : index === SHOES_SLOT
            ? t("orders.quick.shoes")
            : index === ACCESSORIES_SLOT
              ? t("orders.quick.accessories")
              : t("orders.quick.other");

  /**
   * Veste, gilet, pantalon, chemise, jabador, chaussures : la TAILLE d'abord, puis la
   * pièce du stock dans cette taille — une liste courte, pas tout le stock.
   */
  // Chemise et Jabador utilisent eux aussi le geste « taille puis pièce du stock ».
  const sizedSlot = (index: number) => index < ACCESSORIES_SLOT;
  const [isPending, startTransition] = useTransition();
  // En modification, un brouillon EN MÉMOIRE parti de la commande : le
  // brouillon de nouvelle commande gardé dans le téléphone n'est pas touché.
  const [store] = useState(() =>
    edit ? createMemoryStore(edit.initial) : createQuickDraftStore(),
  );
  const [localReady, setLocalReady] = useState(Boolean(edit));
  useEffect(() => {
    if (edit) return;
    if ("hydrate" in store && typeof store.hydrate === "function") {
      store.hydrate();
    }
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setLocalReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [edit, store]);
  // Pendant l'envoi d'une nouvelle commande, la saisie affichée est figée
  // (voir `onSubmit`) : le brouillon stocké est déjà vidé.
  const [frozen, setFrozen] = useState<QuickDraft | null>(null);

  // Modification REPRISE : refusée à l'envoi hors ligne, l'employé l'a rouverte
  // depuis la liste des gestes. Sa saisie revient sur la dernière version —
  // sauf l'argent versé et ✈ / ✓, qui restent ceux de la base : ils ont pu
  // bouger entre-temps, et c'est souvent la raison du refus.
  const [resumed, setResumed] = useState(false);
  useEffect(() => {
    if (!edit) return;
    const key = `dd.editDraft.${edit.orderId}`;
    let saved: QuickDraft | null = null;
    try {
      saved = sanitizeQuickDraft(JSON.parse(sessionStorage.getItem(key) ?? "null"));
      sessionStorage.removeItem(key);
    } catch {
      saved = null;
    }
    if (!saved) return;
    store.set({
      ...saved,
      paid: edit.initial.paid,
      pickedUp: edit.initial.pickedUp,
      returned: edit.initial.returned,
    });
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setResumed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [edit, store]);
  const live = store.useValue();
  const draft = frozen ?? (localReady ? live : EMPTY_DRAFT);

  function updateDraft(patch: Partial<QuickDraft>) {
    store.set(withAutoPrice({ ...store.get(), ...patch }));
  }

  const [showDates, setShowDates] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [serverIssue, setServerIssue] = useState<FieldIssue | null>(null);
  const [generalError, setGeneralError] = useState<FieldIssue | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  /** Incrémenté pour relire la disponibilité après un conflit à l'envoi. */
  const [recheck, setRecheck] = useState(0);
  const [availability, setAvailability] = useState<{
    key: string;
    busy: Map<number, Unavailability>;
  }>({ key: "", busy: EMPTY_BUSY });

  const { pickup, returnDue } = draft;
  const windowValid = Boolean(pickup && returnDue && returnDue >= pickup);
  const windowKey = windowValid ? `${pickup}|${returnDue}|${recheck}` : "";
  const hasStock = useMemo(
    () => models.some((m) => m.units.length > 0),
    [models],
  );

  // Disponibilité du stock sur la fenêtre — pour GRISER, pas pour décider :
  // la contrainte `EXCLUDE` tranche à l'écriture. Sans stock, rien à demander.
  useEffect(() => {
    if (!hasStock || !windowKey) return;
    let cancelled = false;
    const [from, to] = windowKey.split("|"); // le 3e morceau est `recheck`
    // En modification, les pièces de CETTE commande ne sont pas « prises ».
    // Sans réseau : ce que sait le téléphone (dernières réservations connues +
    // commandes provisoires en file) — un avertissement, la base tranchera.
    const lookup = navigator.onLine
      ? checkAvailability(from, to, edit?.orderId).catch(() =>
          localAvailability(from, to, edit?.orderId),
        )
      : localAvailability(from, to, edit?.orderId);
    lookup.then((busy) => {
      if (!cancelled) {
        setAvailability({
          key: windowKey,
          busy: new Map(busy.map((b) => [b.unitId, b])),
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [hasStock, windowKey, edit?.orderId]);

  const busy = availability.key === windowKey ? availability.busy : EMPTY_BUSY;
  const isChecking =
    hasStock && Boolean(windowKey) && availability.key !== windowKey;

  /** Prix catalogue de chaque pièce du stock : la clé de répartition du prix. */
  const listPrice = useMemo(() => {
    const map = new Map<number, number>();
    for (const model of models) {
      for (const unit of model.units)
        map.set(unit.id, resolveUnitPrice(model, unit));
    }
    return map;
  }, [models]);

  /**
   * Les pièces de la commande qu'on modifie. Une ancienne commande mixte ou de
   * vente seule garde ainsi ses articles de vente dans leurs cases.
   */
  const initialUnitIds = useMemo(
    () =>
      new Set(
        (edit?.initial.slots ?? [])
          .map((s) => s.unitId)
          .filter((id): id is number => Boolean(id)),
      ),
    [edit?.initial],
  );

  /**
   * Les articles de VENTE encore visibles ici. La saisie est réservée à la
   * LOCATION, à la demande du client : la vente passe par son propre écran
   * (`/commandes/vente`). Ne restent que ceux d'une commande qu'on modifie.
   */
  const saleUnitIds = useMemo(() => {
    const ids = new Set<number>();
    for (const model of models) {
      if (model.purpose !== "vente") continue;
      for (const unit of model.units) if (initialUnitIds.has(unit.id)) ids.add(unit.id);
    }
    return ids;
  }, [models, initialUnitIds]);
  const isSaleUnit = (id: number | null | undefined) => Boolean(id && saleUnitIds.has(id));

  // VENTE SEULE : tout ce qui est saisi vient du stock de vente. Rien à
  // rendre, donc une seule date — celle de la vente — envoyée comme retrait et
  // retour. La base, elle, en déduit `has_rental` toute seule.
  const filledSlots = draft.slots.filter((s) => s.name.trim());
  const saleOnly = filledSlots.length > 0 && filledSlots.every((s) => isSaleUnit(s.unitId));
  const sendPickup = saleOnly && draft.eventDate ? draft.eventDate : pickup;
  const sendReturn = saleOnly && draft.eventDate ? draft.eventDate : returnDue;

  // --- lignes envoyées -------------------------------------------------------
  const lines: DraftLine[] = useMemo(() => {
    const filled = draft.slots
      .map((slot, index) => ({ slot, index }))
      .filter(({ slot }) => slot.name.trim());

    // La note de ligne ne porte plus la colonne « Tailleur » : chaque pièce a
    // sa RETOUCHE, avec son étiquette QR (`line_alterations`).
    const note = null;

    const raw: DraftLine[] = filled.map(({ slot }) => {
      const alteration = slot.alteration
        ? { id: slot.alteration.id, note: slot.alteration.note }
        : null;
      if (slot.external) {
        return {
          kind: "external",
          source: slot.external.source,
          label: slot.name.trim(),
          cost: slot.external.cost,
          unitPrice: 0,
          note,
          alteration,
        };
      }
      return slot.unitId
        ? {
            kind: "unit",
            unitId: slot.unitId,
            unitPrice: 0,
            note,
            modelName: slot.name,
            refCode: slot.ref ?? "",
            size: slot.size || null,
            alteration,
          }
        : {
            kind: "named",
            name: slot.name.trim(),
            size: slot.size.trim() || null,
            unitPrice: 0,
            note,
            alteration,
          };
    });
    // Le prix de la tenue se répartit au prorata du prix de chaque pièce.
    const weights = filled.map(({ slot }) =>
      slot.unitId && !slot.external ? (listPrice.get(slot.unitId) ?? 0) : 0,
    );
    return spreadOutfitPrice(raw, Number(draft.price) || 0, weights);
  }, [draft.slots, draft.price, listPrice]);

  const total = Number(draft.price) || 0;
  const balance = total - (Number(draft.paid) || 0);

  const takenSlots = draft.slots.filter((s) => s.unitId && busy.has(s.unitId));

  function collectIssues(): Issues {
    const parsed = orderSchema.safeParse({
      customer_name: draft.customerName,
      customer_phone: draft.customerPhone,
      event_date: draft.eventDate,
      pickup_date: sendPickup,
      return_due_date: sendReturn,
      discount: 0,
      amount_paid: draft.paid,
      caution_amount: draft.caution,
      notes: draft.notes,
      lines: toPayload(lines),
    });

    const issues: Issues = {};
    if (!parsed.success) {
      for (const [field, key] of Object.entries(fieldErrorsOf(parsed.error))) {
        issues[field] = { key };
      }
    }
    // Une date oubliée ne fait pas trois erreurs.
    if (issues.event_date) {
      delete issues.pickup_date;
      delete issues.return_due_date;
    }
    // Une taille choisie sans pièce : la case attend sa pièce du stock.
    draft.slots.forEach((slot, index) => {
      if (
        sizedSlot(index) &&
        slot.size.trim() &&
        !slot.unitId &&
        !slot.name.trim()
      ) {
        issues[`part_${index}`] = {
          key: "errors.partNeedsStock",
          values: { part: slotLabel(index), size: slot.size.trim() },
        };
      }
    });
    // « Retouche » cochée sans rien dire au tailleur.
    draft.slots.forEach((slot, index) => {
      if (slot.name.trim() && slot.alteration && !slot.alteration.note.trim()) {
        issues[`alt_${index}`] = { key: "alterations.errors.noteRequired" };
      }
    });
    if (draft.price.trim() && !(Number(draft.price) >= 0)) {
      issues.price = { key: "errors.numberInvalid" };
    }
    if (!issues.lines && takenSlots.length > 0) {
      issues.lines = {
        key: "errors.linesTaken",
        values: { count: formatNumber(takenSlots.length, locale) },
      };
    }
    return issues;
  }

  const issues: Issues = attempted ? collectIssues() : {};
  if (serverIssue && !issues.lines) issues.lines = serverIssue;
  const issueCount = Object.keys(issues).length;
  const issueText = (field: string) => {
    const issue = issues[field];
    return issue ? t(issue.key, issue.values) : null;
  };

  // --- gestes ---------------------------------------------------------------
  function onEventDateChange(value: string) {
    setServerIssue(null);
    if (!value || draft.datesTouched) {
      updateDraft({ eventDate: value });
      return;
    }
    const w = defaultWindow(
      value,
      settings.days_before_event,
      settings.days_after_event,
    );
    updateDraft({ eventDate: value, pickup: w.pickup, returnDue: w.returnDue });
  }

  function setSlot(index: number, patch: Partial<Slot>) {
    setServerIssue(null);
    const slots = store.get().slots.map((s, i) => {
      if (i !== index) return s;
      const next = { ...s, ...patch };
      // Une AUTRE pièce du stock dans la case : l'étiquette déjà imprimée
      // nommait l'ancienne. La retouche repart neuve, note gardée.
      if (
        "unitId" in patch &&
        patch.unitId !== s.unitId &&
        s.alteration?.id &&
        !("alteration" in patch)
      ) {
        next.alteration = { id: null, note: s.alteration.note, done: false };
      }
      return next;
    });
    updateDraft({ slots });
  }

  function toggleAlteration(index: number) {
    const slot = store.get().slots[index];
    setSlot(index, {
      alteration: slot.alteration ? null : { id: null, note: "", done: false },
    });
    if (!slot.alteration) {
      // Le champ apparaît : le curseur y va, le clavier s'ouvre.
      requestAnimationFrame(() => document.getElementById(`q-alt-${index}`)?.focus());
    }
  }

  function removeSlot(index: number) {
    updateDraft({ slots: store.get().slots.filter((_, i) => i !== index) });
  }

  function reset(keepDate: boolean) {
    const d = store.get();
    store.set(
      keepDate
        ? {
            ...EMPTY_DRAFT,
            eventDate: d.eventDate,
            pickup: d.pickup,
            returnDue: d.returnDue,
            datesTouched: d.datesTouched,
          }
        : EMPTY_DRAFT,
    );
    setAttempted(false);
    setServerIssue(null);
    setGeneralError(null);
  }

  // --- listes à cocher -------------------------------------------------------
  // `n` change à chaque ouverture : la liste est remontée et repart de la case.
  const [picker, setPicker] = useState<{
    index: number;
    n: number;
    open: boolean;
    /** « + Article à vendre » : la liste ne montre que le stock de VENTE. */
  } | null>(null);
  const [sizePicker, setSizePicker] = useState<{
    index: number;
    n: number;
    open: boolean;
  } | null>(null);

  const pickedUnits = new Set(draft.slots.map((s) => s.unitId).filter(Boolean));

  /** Pièces du stock par id, avec leur nom affiché et leur prix. */
  const unitIndex = useMemo(() => {
    const map = new Map<
      number,
      {
        model: PickerModel;
        unit: PickerModel["units"][number];
        name: string;
        price: number;
      }
    >();
    for (const model of models) {
      const name =
        (locale === "ar" ? model.name_ar : model.name_fr) || model.name_fr;
      for (const unit of model.units) {
        // Le stock de VENTE n'a pas sa place dans la saisie de location — sauf
        // les articles de la commande qu'on modifie.
        if (model.purpose === "vente" && !initialUnitIds.has(unit.id)) continue;
        // Une paire vendue par UNE AUTRE commande a quitté la boutique : elle
        // n'est plus proposée nulle part. Celle de la commande qu'on modifie
        // reste, sinon elle disparaîtrait de sa propre case.
        if (unit.sold_order_id && unit.sold_order_id !== edit?.orderId) continue;
        map.set(unit.id, {
          model,
          unit,
          name,
          price: resolveUnitPrice(model, unit),
        });
      }
    }
    return map;
  }, [models, locale, edit?.orderId, initialUnitIds]);

  /** Pourquoi une pièce ne peut pas être prise, pour la case `index`. */
  function unitState(id: number, index: number) {
    const { unit } = unitIndex.get(id)!;
    const own = draft.slots[index] as Slot | undefined;
    const blocked = busy.get(id);
    const material = unit.status !== "disponible";
    const elsewhere = pickedUnits.has(id) && own?.unitId !== id;

    let reason: string | null = null;
    if (!windowValid) reason = t("orders.quick.dateFirst");
    else if (material)
      reason = t(
        unit.status === "nettoyage" ? "stock.cleaning" : "stock.repair",
      );
    else if (blocked?.late)
      reason = t("orders.unitLate", { no: blocked.orderNo ?? "?" });
    else if (blocked)
      reason = blocked.freeFrom
        ? t("orders.freeFrom", { date: formatDate(blocked.freeFrom, locale) })
        : t("orders.takenOnDates");

    // `taken` : la pièce n'est pas libre sur ces dates (ou pas en état).
    return { reason, taken: material || Boolean(blocked), elsewhere };
  }

  /** Cette pièce du stock va-t-elle dans la case `index` ? */
  function unitFitsSlot(
    index: number,
    model: PickerModel,
    unit: PickerModel["units"][number],
  ): boolean {
    const part = partOfSlot(index);
    if (part) return (unit.part ?? model.category_slug) === part;
    const slotNo = catalogSlotOf(index);
    return Boolean(
      slotNo && SLOT_CATEGORIES[slotNo]?.includes(model.category_slug ?? ""),
    );
  }

  /** Les tailles proposées : la série habituelle, plus celles du stock (M, L…). */
  function slotSizes(index: number): string[] {
    const series = partOfSlot(index)
      ? SUIT_SIZES
      : index === SHIRT_SLOT || index === JABADOR_SLOT
        ? ORDER_SHIRT_SIZES
        : index === SHOES_SLOT
          ? sizeSeries("chaussures")
          : [];
    const stock: string[] = [];
    for (const { model, unit } of unitIndex.values()) {
      if (unitFitsSlot(index, model, unit) && unit.size) stock.push(unit.size);
    }
    return sortSizes([...series, ...stock]);
  }

  function pickerOptions(index: number): PickerOption[] {
    const slotNo = catalogSlotOf(index);
    // Une pièce EN PLUS peut être n'importe quoi : tout est proposé.
    const extra = slotNo === null;
    const options: PickerOption[] = [];

    const unitOption = (id: number, featured: boolean): PickerOption => {
      const { unit, name, price } = unitIndex.get(id)!;
      const { reason, taken, elsewhere } = unitState(id, index);
      // Le NOM seulement, à la demande du client : la référence encombrait la
      // ligne. Elle reste trouvable par la recherche.
      const label = unit.part ? `${name} · ${partLabel(unit.part)}` : name;
      return {
        key: `u:${id}`,
        label,
        search: `${label} ${unit.ref_code}`,
        secondary: (
          <>
            <Package
              className="text-gold-strong me-1 inline size-3"
              aria-hidden
            />
            {unit.size && `${t("stock.size")} ${unit.size}`}
            {isSaleUnit(id) && (
              <span className="text-gold-strong font-medium"> · {t("orders.saleTag")}</span>
            )}
            {reason && (
              <span className="text-warning-foreground"> · {reason}</span>
            )}
          </>
        ),
        trailing: <span className="tabular">{formatMoney(price, locale)}</span>,
        disabled: !windowValid || elsewhere || taken,
        featured,
      };
    };

    // Veste, gilet, pantalon, chemise, jabador et chaussures : les pièces du stock de
    // CETTE case, dans la taille choisie.
    // L'équipe FAIT DÉFILER plutôt que de chercher : les pièces libres
    // d'abord, rangées par taille puis par référence.
    const size = sizedSlot(index)
      ? (draft.slots[index]?.size.trim() ?? "")
      : "";
    const stockOnly =
      Boolean(partOfSlot(index)) ||
      (slotNo !== null && STOCK_ONLY_SLOTS.has(slotNo));
    if (stockOnly || size) {
      const rows: { option: PickerOption; size: string; ref: string }[] = [];
      for (const [id, { model, unit }] of unitIndex) {
        if (!unitFitsSlot(index, model, unit)) continue;
        if (size && (unit.size ?? "").trim() !== size) continue;
        rows.push({
          option: unitOption(id, true),
          size: unit.size ?? "",
          ref: unit.ref_code ?? "",
        });
      }
      rows.sort(
        (a, b) =>
          Number(Boolean(a.option.disabled)) -
            Number(Boolean(b.option.disabled)) ||
          a.size.localeCompare(b.size, undefined, { numeric: true }) ||
          a.ref.localeCompare(b.ref, undefined, { numeric: true }),
      );
      options.push(...rows.map((r) => r.option));
      // Chemise et Jabador : après les pièces du stock, les noms de SA liste
      // dans cette taille — le geste marche même stock vide. Une taille
      // absente de sa liste (Jabador XXL) montre toute la liste plutôt que rien.
      if (!stockOnly) {
        const own = items.filter((item) => item.slot === slotNo);
        const sized = own.filter((item) => labelHasSize(item.label, size));
        for (const item of sized.length ? sized : own) {
          options.push({
            key: `h:${item.label}`,
            label: item.label,
            featured: true,
          });
        }
      }
      return options;
    }

    // 1. Le stock d'abord : c'est la seule pièce dont on garantit les dates.
    for (const [id, { model }] of unitIndex) {
      const featured =
        extra ||
        Boolean(
          slotNo &&
          SLOT_CATEGORIES[slotNo]?.includes(model.category_slug ?? ""),
        );
      options.push(unitOption(id, featured));
    }

    // 2. Ses vêtements déjà saisis — ceux de CETTE case montrés d'office.
    // Dans l'ordre de SES listes (`item-catalog`), pas l'ordre alphabétique.
    for (const item of items) {
      options.push({
        key: `h:${item.label}`,
        label: item.label,
        featured: extra || item.slot === slotNo,
      });
    }
    return options;
  }

  /** La valeur actuelle d'une case, sous forme de clé de la liste. */
  function selectedKeys(index: number): string[] {
    const slot = draft.slots[index] as Slot | undefined;
    if (!slot) return [];
    if (slot.unitId) return [`u:${slot.unitId}`];
    const name = slot.name.trim();
    if (!name) return [];
    const known = items.find(
      (i) => normalizeSearch(i.label) === normalizeSearch(name),
    );
    return [known ? `h:${known.label}` : NEW_KEY + name];
  }

  /** Une pièce du stock, prête à remplir une case. */
  function unitSlot(id: number): Partial<Slot> | null {
    const found = unitIndex.get(id);
    if (!found) return null;
    return {
      name: found.unit.part
        ? `${found.name} · ${partLabel(found.unit.part)}`
        : found.name,
      size: found.unit.size ?? "",
      unitId: found.unit.id,
      ref: found.unit.ref_code,
      stockPrice: found.price,
      external: null,
    };
  }

  /** Une clé cochée → de quoi remplir une case. */
  function slotFromKey(key: string): Partial<Slot> | null {
    if (key.startsWith(NEW_KEY)) {
      return {
        name: key.slice(NEW_KEY.length),
        unitId: null,
        ref: null,
        stockPrice: null,
        external: null,
      };
    }
    if (key.startsWith("h:")) {
      return {
        name: key.slice(2),
        unitId: null,
        ref: null,
        stockPrice: null,
        external: null,
      };
    }
    return unitSlot(Number(key.slice(2)));
  }

  /**
   * Applique la liste cochée à une case. Comme dans AppSheet on peut en cocher
   * PLUSIEURS : la première remplit la case, les suivantes deviennent des
   * pièces en plus — deux cravates, une ceinture. Les cases fixes, elles, se
   * remplissent d'un seul toucher (`instant`) : une pièce à la fois.
   */
  function applyPicked(index: number, keys: string[]) {
    setServerIssue(null);
    const picks = keys
      .map(slotFromKey)
      .filter((pick): pick is Partial<Slot> => pick !== null);
    const slots = [...store.get().slots];
    const base = slots[index];
    // La taille venait de la pièce du stock : elle part avec elle.
    const keptSize = base.unitId ? "" : base.size;

    if (!picks.length) {
      slots[index] = {
        ...base,
        name: "",
        unitId: null,
        ref: null,
        stockPrice: null,
        external: null,
        size: keptSize,
      };
    } else {
      const [first, ...rest] = picks;
      // Chemise, Jabador : « Jabador M - Vert » choisi sans taille donne M.
      const named =
        !first.unitId &&
        !keptSize &&
        (index === SHIRT_SLOT || index === JABADOR_SLOT)
          ? (sizeInLabel(first.name ?? "", slotSizes(index)) ?? "")
          : "";
      slots[index] = {
        ...base,
        ...first,
        size: first.unitId ? (first.size ?? "") : keptSize || named,
      };
      for (const more of rest) slots.push({ ...EMPTY_SLOT, ...more });
    }
    updateDraft({ slots });
    setPicker((p) => (p ? { ...p, open: false } : p));
  }

  function openPicker(index: number) {
    setPicker({ index, n: Date.now(), open: true });
  }

  function closePicker() {
    if (!picker) return;
    // « + Autre pièce » refermé sans rien choisir : pas de case vide qui traîne.
    const slot = store.get().slots[picker.index];
    if (picker.index >= FIXED_SLOTS && slot && !slot.name.trim())
      removeSlot(picker.index);
    setPicker({ ...picker, open: false });
  }

  /**
   * « + Autre pièce » : une case en plus, et sa liste
   * ouverte d'emblée.
   *
   * Une case en plus restée VIDE est reprise au lieu d'en ajouter une autre :
   * un double toucher — ou le « clic fantôme » du téléphone pendant que la
   * liste s'ouvre — ajoutait sinon deux cases.
   */
  function addSlotAndPick() {
    const slots = store.get().slots;
    let index = slots.findIndex((s, i) => i >= FIXED_SLOTS && !s.name.trim());
    if (index === -1) {
      index = slots.length;
      updateDraft({ slots: [...slots, EMPTY_SLOT] });
    }
    setPicker({ index, n: Date.now(), open: true });
  }

  /**
   * La taille d'une partie du costume — choisie AVANT la pièce, elle filtre sa
   * liste. Une pièce déjà choisie d'une autre taille s'en va : la case garde
   * la taille, et attend la bonne pièce.
   */
  function pickSize(index: number, value: string) {
    const slot = store.get().slots[index];
    const stale =
      slot.unitId &&
      (unitIndex.get(slot.unitId)?.unit.size ?? "").trim() !== value;
    setSlot(
      index,
      stale
        ? {
            size: value,
            name: "",
            unitId: null,
            ref: null,
            stockPrice: null,
            external: null,
          }
        : { size: value },
    );
    setSizePicker((p) => (p ? { ...p, open: false } : p));
  }

  /** « Veste · Taille 50 » — le titre de la liste d'une case à taille. */
  const sizedTitle = (index: number) => {
    const size = draft.slots[index]?.size.trim();
    const label = slotLabel(index);
    return size ? `${label} · ${t("stock.size")} ${size}` : label;
  };

  const customerOptions: SuggestOption[] = (() => {
    const q = normalizeSearch(draft.customerName);
    if (q.length < 2) return [];
    return customers
      .filter(
        (c) =>
          normalizeSearch(c.name).includes(q) &&
          !(
            normalizeSearch(c.name) === q &&
            (c.phone ?? "") === draft.customerPhone
          ),
      )
      .slice(0, MAX_SUGGESTIONS)
      .map((c) => ({
        key: `${c.name}|${c.phone ?? ""}`,
        primary: <HighlightText text={c.name} q={draft.customerName} />,
        secondary: c.phone ? <bdi dir="ltr">{c.phone}</bdi> : undefined,
        onPick: () =>
          updateDraft({ customerName: c.name, customerPhone: c.phone ?? "" }),
      }));
  })();

  // --- envoi ----------------------------------------------------------------
  function revealFirst(found: Issues) {
    flushSync(() => {
      setAttempted(true);
      if (found.pickup_date || found.return_due_date) setShowDates(true);
    });
    const target = FIELD_TARGETS.find(([field]) => found[field]);
    const el = target ? document.getElementById(target[1]) : null;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus({ preventScroll: true });
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const another = submitter?.getAttribute("value") === "another";

    const found = collectIssues();
    if (Object.keys(found).length > 0) {
      revealFirst(found);
      return;
    }

    setServerIssue(null);
    setGeneralError(null);
    // La saisie telle quelle, avant tout gel : c'est elle qu'on garde si la
    // commande part en file.
    const typed = store.get();
    // Identifiant tiré UNE fois : en ligne comme en file. Si la réponse se
    // perd après que la base a créé la commande, le renvoi ne la recrée pas.
    const opId = crypto.randomUUID();
    const formData = new FormData();
    formData.set("locale", locale);
    // « Enregistrer » d'une NOUVELLE commande : l'action redirige elle-même
    // vers la liste (un seul aller-retour). Les autres cas restent sur place
    // ou choisissent leur page : ils veulent le résultat.
    const redirects = !edit && !another;
    if (!redirects) formData.set("return_id", "1");
    if (edit) formData.set("id", String(edit.orderId));
    formData.set("customer_name", draft.customerName);
    formData.set("customer_phone", draft.customerPhone);
    formData.set("event_date", draft.eventDate);
    formData.set("pickup_date", sendPickup);
    formData.set("return_due_date", sendReturn);
    formData.set("discount", "0");
    formData.set("amount_paid", draft.paid);
    formData.set("caution_amount", draft.caution);
    formData.set("notes", draft.notes);
    formData.set("picked_up", draft.pickedUp ? "1" : "0");
    formData.set("returned", draft.returned ? "1" : "0");
    formData.set("lines", JSON.stringify(toPayload(lines)));
    if (edit) formData.set("expected_version", String(edit.version));
    else formData.set("client_op_id", opId);
    const name = draft.customerName.trim();

    /**
     * Pas de réseau : la commande devient PROVISOIRE. Elle attend dans la file
     * et la base la confirmera — ou la refusera, pièce déjà louée — au retour
     * du réseau. L'écran le dit sans détour : on ne promet pas la tenue.
     */
    const queueProvisional = async () => {
      const fields: Record<string, string> = {};
      for (const [key, value] of formData.entries()) {
        if (typeof value === "string" && !["locale", "return_id", "id", "client_op_id", "expected_version"].includes(key)) {
          fields[key] = value;
        }
      }
      const summary = {
        customerName: name,
        eventDate: draft.eventDate,
        pickup: sendPickup,
        returnDue: sendReturn,
        unitIds: [...unitIdsIn(lines)],
      };
      if (edit) {
        await queueOp(
          {
            kind: "orderEdit",
            orderId: edit.orderId,
            orderNo: edit.orderNo,
            expectedVersion: edit.version,
            fields,
            draft: typed,
            summary,
          },
          t("offline.orderEditTitle", { no: edit.orderNo, name }),
        );
        toast(t("offline.queuedToast"));
        // Navigation complète : sans réseau, le service worker sert la fiche
        // hors ligne.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- navigation COMPLÈTE voulue : sans réseau, seul le service worker peut servir la page hors ligne.
        window.location.assign(`/${locale}/commandes/${edit.orderId}`);
        return;
      }
      await queueOp(
        { kind: "order", opId, fields, draft: typed, summary },
        t("offline.orderTitle", { name, date: formatDate(draft.eventDate, locale) }),
      );
      setFrozen(null);
      reset(another);
      toast(t("offline.queuedToast"));
      window.scrollTo({ top: 0, behavior: "smooth" });
    };

    if (!navigator.onLine) {
      startTransition(queueProvisional);
      return;
    }

    // Le brouillon du téléphone est vidé TOUT DE SUITE : la redirection
    // démonte le formulaire, il n'y aurait plus de « après » pour le faire.
    // L'écran, lui, garde la saisie figée pendant l'envoi, et tout revient
    // si le serveur refuse.
    const saved = redirects ? store.get() : null;
    if (saved) {
      setFrozen(saved);
      store.set(EMPTY_DRAFT);
    }

    startTransition(async () => {
      const restore = () => {
        if (!saved) return;
        store.set(saved);
        setFrozen(null);
      };
      let result: Awaited<ReturnType<typeof createOrder>>;
      try {
        result = await (edit ? updateOrder(formData) : createOrder(formData));
      } catch (error) {
        // La redirection de l'action passe par ici sous forme d'erreur
        // spéciale de Next : on la laisse filer, la liste s'affiche.
        unstable_rethrow(error);
        restore();
        // Réseau coupé en route : la commande part en file, provisoire.
        if (isNetworkError(error)) {
          await queueProvisional();
          return;
        }
        // L'action a planté côté serveur (exception, page de redirection en
        // erreur…) : la trace complète va dans la console du navigateur.
        console.error("[commande] l'action a échoué :", error);
        setGeneralError({
          key: "errors.generic",
          detail:
            process.env.NODE_ENV === "development"
              ? error instanceof Error
                ? `${error.name}: ${error.message}`
                : String(error)
              : undefined,
        });
        return;
      }
      // Redirigé : la liste s'affiche, rien d'autre à faire ici.
      if (!result) return;
      if (!result.ok) restore();

      if (result.ok && edit) {
        toast.success(t("orders.edit.savedToast", { name }));
        router.push(`/commandes/${edit.orderId}`);
        return;
      }
      if (result.ok) {
        const href = `/commandes/${result.id}`;
        // « Enregistrer » seul est redirigé par l'action : ici, c'est
        // « + Autre » — même mariage, client suivant : on garde la date.
        reset(true);
        toast.success(t("orders.quick.savedToast", { name }), {
          action: {
            label: t("orders.quick.view"),
            onClick: () => router.push(href),
          },
        });
        window.scrollTo({ top: 0, behavior: "smooth" });
        document.getElementById("q-name")?.focus({ preventScroll: true });
        return;
      }

      if (result.error.startsWith("errors.unitUnavailable")) {
        // Un collègue a pris la pièce entre-temps : on relit la disponibilité.
        setRecheck((n) => n + 1);
        setServerIssue({ key: result.error, values: result.values });
        revealFirst({ lines: { key: result.error } });
        return;
      }
      if (result.fieldErrors && Object.keys(result.fieldErrors).length > 0) {
        const fromServer: Issues = {};
        for (const [field, key] of Object.entries(result.fieldErrors)) {
          fromServer[field] = { key };
        }
        revealFirst(fromServer);
        return;
      }
      if (result.error === "errors.generic") {
        console.error("[commande] refusée par le serveur :", result);
      }
      setGeneralError({ key: result.error, values: result.values, detail: result.detail });
    });
  }

  /** Entrée = champ suivant, comme dans un tableur — jamais un envoi accidentel. */
  function onKeyDown(event: React.KeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Enter" || event.defaultPrevented) return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    event.preventDefault();
    focusNextField(target);
  }

  const windowLabel = windowValid
    ? t("orders.window", {
        pickup: formatDate(pickup, locale),
        returnDue: formatDate(returnDue, locale),
      })
    : "";

  return (
    <form onSubmit={onSubmit} onKeyDown={onKeyDown} noValidate>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="font-heading text-xl font-medium">
          {edit
            ? t("orders.edit.title", { no: edit.orderNo })
            : t("orders.newTitle")}
        </h1>
        {!edit && isDirty(draft) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setClearOpen(true)}
            className="text-muted-foreground min-h-11"
          >
            <Eraser className="size-4" aria-hidden />
            {t("orders.quick.clear")}
          </Button>
        )}
      </div>

      {resumed && (
        <Alert className="mb-4">
          <AlertCircle />
          <AlertDescription>{t("offline.resumedEdit")}</AlertDescription>
        </Alert>
      )}

      {/* --- Client ---------------------------------------------------------- */}
      <Section id="q-client" title={t("orders.customer")}>
        <FieldGroup>
          <Field data-invalid={!!issues.customer_name || undefined}>
            <FieldLabel htmlFor="q-name">
              {t("orders.customerName")}
              <RequiredMark />
            </FieldLabel>
            <SuggestInput
              id="q-name"
              value={draft.customerName}
              onValueChange={(v) => updateDraft({ customerName: v })}
              options={customerOptions}
              invalid={!!issues.customer_name}
              enterKeyHint="next"
              autoCapitalize="words"
              aria-required
            />
            {issues.customer_name && (
              <FieldError>{issueText("customer_name")}</FieldError>
            )}
          </Field>

          <Field data-invalid={!!issues.customer_phone || undefined}>
            <FieldLabel htmlFor="q-phone">
              {t("orders.quick.phoneOptional")}
            </FieldLabel>
            <Input
              id="q-phone"
              data-field
              type="tel"
              inputMode="tel"
              dir="ltr"
              value={draft.customerPhone}
              onChange={(e) => updateDraft({ customerPhone: e.target.value })}
              enterKeyHint="next"
              autoComplete="off"
              className="h-12 text-base"
              aria-invalid={!!issues.customer_phone || undefined}
            />
            {issues.customer_phone && (
              <FieldError>{issueText("customer_phone")}</FieldError>
            )}
          </Field>

          <Field data-invalid={!!issues.event_date || undefined}>
            <FieldLabel htmlFor="q-date">
              {saleOnly ? t("orders.saleDate") : t("orders.eventDate")}
              <RequiredMark />
            </FieldLabel>
            <DatePicker
              id="q-date"
              value={draft.eventDate}
              onChange={onEventDateChange}
              placeholder={t("common.pickDate")}
              invalid={!!issues.event_date}
            />
            {issues.event_date && (
              <FieldError>{issueText("event_date")}</FieldError>
            )}

            {saleOnly ? (
              <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
                <Package className="text-gold-strong size-4 shrink-0" aria-hidden />
                {t("orders.saleOnlyHint")}
              </p>
            ) : windowLabel && (
              <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 text-sm">
                <span className="flex items-center gap-1.5">
                  <CalendarRange
                    className="text-gold-strong size-4 shrink-0"
                    aria-hidden
                  />
                  <span className="tabular">{windowLabel}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowDates((v) => !v)}
                  aria-expanded={showDates}
                  className="text-gold-strong min-h-11 underline underline-offset-4"
                >
                  {t("common.edit")}
                </button>
              </div>
            )}
          </Field>

          {draft.eventDate && showDates && !saleOnly && (
            <div className="grid grid-cols-2 gap-3">
              <Field data-invalid={!!issues.pickup_date || undefined}>
                <FieldLabel htmlFor="q-pickup">
                  {t("orders.pickupDate")}
                </FieldLabel>
                <DatePicker
                  id="q-pickup"
                  value={pickup}
                  onChange={(v) =>
                    updateDraft({ pickup: v, datesTouched: true })
                  }
                  invalid={!!issues.pickup_date}
                  disabledDays={
                    returnDue ? { after: toCalendarDate(returnDue) } : undefined
                  }
                />
                {issues.pickup_date && (
                  <FieldError>{issueText("pickup_date")}</FieldError>
                )}
              </Field>
              <Field data-invalid={!!issues.return_due_date || undefined}>
                <FieldLabel htmlFor="q-return">
                  {t("orders.returnDate")}
                </FieldLabel>
                <DatePicker
                  id="q-return"
                  value={returnDue}
                  onChange={(v) =>
                    updateDraft({ returnDue: v, datesTouched: true })
                  }
                  invalid={!!issues.return_due_date}
                  disabledDays={
                    pickup ? { before: toCalendarDate(pickup) } : undefined
                  }
                />
                {issues.return_due_date && (
                  <FieldError>{issueText("return_due_date")}</FieldError>
                )}
              </Field>
            </div>
          )}

          {/* « Allez valide » / « Retour valide » : les deux cases ✗/✓ de son
              formulaire. Le plus souvent laissées à ✗ — on les coche sur la
              fiche le jour J — mais un client qui réserve et emporte sa tenue
              dans la foulée se valide ici, sans rouvrir la commande. */}
          {/* Vente seule : rien ne revient. La base coche le retour avec la
              sortie ; la case « Retour » n'a rien à faire à l'écran. */}
          <div className={cn("grid gap-3", saleOnly ? "grid-cols-1" : "grid-cols-2")}>
            <FlagToggle
              icon={<Plane className="size-4 rtl:-scale-x-100" aria-hidden />}
              label={t("orders.pickedUp")}
              checked={draft.pickedUp}
              // Décocher la sortie décoche aussi le retour : une tenue ne
              // revient pas sans être partie.
              onChange={(v) =>
                updateDraft({ pickedUp: v, returned: v && draft.returned })
              }
            />
            {!saleOnly && (
              <FlagToggle
                icon={<CircleCheck className="size-4" aria-hidden />}
                label={t("orders.returned")}
                checked={draft.returned}
                onChange={(v) =>
                  updateDraft({ returned: v, pickedUp: v || draft.pickedUp })
                }
              />
            )}
          </div>
        </FieldGroup>
      </Section>

      {/* --- Tenue -----------------------------------------------------------
          Les cases de son AppSheet : on TOUCHE une case, on coche dans la
          liste, « Valider ». Plus rien à taper pour un vêtement déjà connu. */}
      <Section
        id="q-outfit"
        title={
          <>
            {t("orders.quick.outfit")}
            <RequiredMark />
          </>
        }
        invalid={!!issues.lines}
        aside={
          isChecking ? <Spinner className="text-muted-foreground" /> : null
        }
      >
        <p className="text-muted-foreground -mt-2 mb-4 text-sm">
          {t("orders.quick.outfitHint")}
        </p>

        <div className="space-y-4">
          {draft.slots.map((slot, index) => {
            const part = partOfSlot(index);
            const partIssue = issueText(`part_${index}`);
            const taken = slot.unitId ? busy.get(slot.unitId) : undefined;
            return (
              <div key={index}>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label
                    htmlFor={`q-slot-${index}`}
                    className="text-sm font-medium"
                  >
                    {slotLabel(index)}
                  </label>
                  <div className="-my-2 flex items-center">
                  {slot.name.trim() && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-pressed={Boolean(slot.alteration)}
                      onClick={() => toggleAlteration(index)}
                      className={cn(
                        "h-11 gap-1.5 px-2 text-xs",
                        slot.alteration
                          ? "text-gold-strong font-medium"
                          : "text-muted-foreground",
                      )}
                    >
                      <Scissors className="size-4" aria-hidden />
                      {t("alterations.toggle")}
                    </Button>
                  )}
                  {index >= FIXED_SLOTS && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeSlot(index)}
                      className="text-muted-foreground hover:text-destructive -my-2 size-11"
                    >
                      <X className="size-4" aria-hidden />
                      <span className="sr-only">{t("orders.removeLine")}</span>
                    </Button>
                  )}
                  </div>
                </div>

                {/* Accessoires : TEXTE LIBRE. Le patron ne les met pas en
                    stock — « Ceinture + cravate rouge » se tape, ne se choisit
                    pas. Une ancienne commande dont l'accessoire est une pièce
                    du stock garde sa liste, pour ne pas perdre la pièce. */}
                {index === ACCESSORIES_SLOT && !slot.unitId ? (
                  <Input
                    id={`q-slot-${index}`}
                    value={slot.name}
                    placeholder={t("orders.quick.accessoryPlaceholder")}
                    autoComplete="off"
                    enterKeyHint="next"
                    onChange={(e) =>
                      setSlot(index, {
                        name: e.target.value,
                        unitId: null,
                        ref: null,
                        stockPrice: null,
                        external: null,
                      })
                    }
                    className="h-12 text-base"
                  />
                ) : sizedSlot(index) ? (
                  // La TAILLE d'abord, puis la pièce du stock dans cette taille.
                  <div className="flex gap-2">
                    <button
                      type="button"
                      id={`q-size-${index}`}
                      aria-label={`${t("stock.size")} · ${slotLabel(index)}`}
                      onClick={() =>
                        setSizePicker({ index, n: Date.now(), open: true })
                      }
                      data-invalid={partIssue ? true : undefined}
                      className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 data-[invalid=true]:border-destructive flex h-12 w-20 shrink-0 flex-col items-center justify-center rounded-md border outline-none focus-visible:ring-[3px]"
                    >
                      <span className="text-muted-foreground text-xs leading-none">
                        {t("stock.size")}
                      </span>
                      {slot.size ? (
                        <span className="tabular mt-0.5 max-w-full truncate px-1 text-base font-medium">
                          {slot.size}
                        </span>
                      ) : (
                        <Plus
                          className="text-muted-foreground mt-0.5 size-4"
                          aria-hidden
                        />
                      )}
                    </button>
                    <PickerField
                      id={`q-slot-${index}`}
                      className="min-w-0 flex-1"
                      value={slot.name}
                      placeholder={t(
                        part || index === SHOES_SLOT
                          ? "orders.quick.pickPart"
                          : "orders.quick.pickPlaceholder",
                      )}
                      onOpen={() => openPicker(index)}
                      onClear={() => applyPicked(index, [])}
                      invalid={
                        Boolean(partIssue) || (!!issues.lines && index === 0)
                      }
                    />
                  </div>
                ) : (
                  <PickerField
                    id={`q-slot-${index}`}
                    value={slot.name}
                    placeholder={t("orders.quick.pickPlaceholder")}
                    onOpen={() => openPicker(index)}
                    onClear={() => applyPicked(index, [])}
                    // Une ancienne saisie avec sa taille à part (avant les
                    // listes) : on la montre plutôt que de la perdre de vue.
                    secondary={
                      !slot.unitId && slot.size ? (
                        <span className="text-muted-foreground">
                          {t("orders.quick.size")} {slot.size}
                        </span>
                      ) : undefined
                    }
                  />
                )}

                {partIssue && (
                  <p role="alert" className="text-destructive mt-1.5 text-sm">
                    {partIssue}
                  </p>
                )}

                {slot.unitId && (
                  <p
                    className={cn(
                      "mt-1.5 flex items-center gap-1.5 text-xs",
                      taken
                        ? "text-warning-foreground font-medium"
                        : "text-success",
                    )}
                  >
                    {taken ? (
                      <AlertTriangle
                        className="size-3.5 shrink-0"
                        aria-hidden
                      />
                    ) : (
                      <Package className="size-3.5 shrink-0" aria-hidden />
                    )}
                    {t("orders.quick.fromStock")} <bdi>{slot.ref}</bdi>
                    {slot.size && ` · ${t("stock.size")} ${slot.size}`}
                    {isSaleUnit(slot.unitId) && (
                      <span className="text-gold-strong font-medium">
                        {` · ${t("orders.saleTag")}`}
                      </span>
                    )}
                    {taken &&
                      ` · ${
                        taken.freeFrom
                          ? t("orders.freeFrom", {
                              date: formatDate(taken.freeFrom, locale),
                            })
                          : t("orders.takenOnDates")
                      }`}
                  </p>
                )}

                {/* RETOUCHE de la pièce : ce que le tailleur lira sur
                    l'étiquette QR collée sur le vêtement. */}
                {slot.name.trim() && slot.alteration && (
                  <div className="border-gold-strong/30 bg-gold-soft/40 mt-2 rounded-md border p-2">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <label
                        htmlFor={`q-alt-${index}`}
                        className="text-muted-foreground text-xs"
                      >
                        {t("alterations.noteLabel")}
                      </label>
                      {slot.alteration.done && (
                        <span className="bg-success-soft text-success-foreground inline-flex items-center gap-1 rounded-full px-2 text-[11px] leading-5">
                          <CircleCheck className="size-3" aria-hidden />
                          {t("alterations.status.taillee")}
                        </span>
                      )}
                    </div>
                    <Input
                      id={`q-alt-${index}`}
                      data-field
                      value={slot.alteration.note}
                      maxLength={200}
                      onChange={(e) =>
                        setSlot(index, {
                          alteration: { ...slot.alteration!, note: e.target.value },
                        })
                      }
                      placeholder={t("alterations.notePlaceholder")}
                      aria-invalid={issues[`alt_${index}`] ? true : undefined}
                      enterKeyHint="next"
                      autoComplete="off"
                      className="h-12 text-base"
                    />
                    {issues[`alt_${index}`] && (
                      <p role="alert" className="text-destructive mt-1 text-sm">
                        {issueText(`alt_${index}`)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {issues.lines && (
          <p role="alert" className="text-destructive mt-3 text-sm">
            {issueText("lines")}
          </p>
        )}

        {/* Pas de vente ici : elle a son propre écran (`/commandes/vente`). */}
        <Button
          type="button"
          variant="outline"
          onClick={() => addSlotAndPick()}
          className="mt-4 h-11 w-full text-base"
        >
          <Plus className="size-4" aria-hidden />
          {t("orders.quick.addOther")}
        </Button>
      </Section>

      {/* --- Paiement --------------------------------------------------------
          L'ordre de son AppSheet : VERS, PRIX, puis REST calculé. */}
      <Section id="q-payment" title={t("orders.quick.payment")}>
        <FieldGroup>
          <Field data-invalid={!!issues.amount_paid || undefined}>
            <FieldLabel htmlFor="q-paid">{t("orders.paid")}</FieldLabel>
            <MoneyStepper
              id="q-paid"
              value={draft.paid}
              onChange={(v) => updateDraft({ paid: v })}
              invalid={!!issues.amount_paid}
            />
            {issues.amount_paid && (
              <FieldError>{issueText("amount_paid")}</FieldError>
            )}
          </Field>

          <Field data-invalid={!!issues.price || undefined}>
            <FieldLabel htmlFor="q-price">{t("orders.quick.price")}</FieldLabel>
            <MoneyStepper
              id="q-price"
              value={draft.price}
              onChange={(v) => updateDraft({ price: v, priceTouched: true })}
              invalid={!!issues.price}
            />
            {issues.price && <FieldError>{issueText("price")}</FieldError>}
          </Field>

          {total > 0 && draft.paid !== String(total) && (
            <Button
              type="button"
              variant="outline"
              onClick={() => updateDraft({ paid: String(total) })}
              className="h-11 w-full text-base"
            >
              {t("orders.quick.paidAll", {
                amount: formatMoney(total, locale),
              })}
            </Button>
          )}

          {/* REST : calculé, jamais saisi — comme la colonne générée en base. */}
          <div>
            <p className="mb-1.5 text-sm font-medium">{t("orders.balance")}</p>
            <p
              className={cn(
                "bg-muted/60 tabular flex h-12 items-center rounded-md px-3 text-base",
                balance > 0
                  ? "text-warning-foreground font-medium"
                  : "text-muted-foreground",
              )}
              aria-live="polite"
            >
              {formatMoney(balance, locale)}
            </p>
          </div>

          {/* Pas de caution sur une vente seule : rien ne revient. Une caution
              déjà saisie reste visible, pour pouvoir l'effacer. */}
          {(!saleOnly || draft.caution) && (
            <Field data-invalid={!!issues.caution_amount || undefined}>
              <FieldLabel htmlFor="q-caution">{t("orders.caution")}</FieldLabel>
              <MoneyStepper
                id="q-caution"
                value={draft.caution}
                onChange={(v) => updateDraft({ caution: v })}
                invalid={!!issues.caution_amount}
              />
              {issues.caution_amount && (
                <FieldError>{issueText("caution_amount")}</FieldError>
              )}
            </Field>
          )}

          <Field data-invalid={!!issues.notes || undefined}>
            <FieldLabel htmlFor="q-notes">{t("orders.notesTitle")}</FieldLabel>
            <Textarea
              id="q-notes"
              data-field
              rows={2}
              value={draft.notes}
              onChange={(e) => updateDraft({ notes: e.target.value })}
              className="text-base"
            />
            {issues.notes && <FieldError>{issueText("notes")}</FieldError>}
          </Field>
        </FieldGroup>
      </Section>

      {generalError && (
        <Alert variant="destructive" className="mt-6">
          <AlertCircle />
          <AlertDescription>
            {t(generalError.key, generalError.values)}
            {generalError.detail && (
              <code dir="ltr" className="mt-1 block text-xs break-all whitespace-pre-wrap">
                {generalError.detail}
              </code>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Barre collante : le reste bouge pendant la frappe, et les deux façons
          d'enregistrer sont toujours sous le pouce. */}
      <div className="bg-background border-border bottom-above-nav sticky z-30 mt-6 border-t py-3 md:bottom-0">
        <div className="mb-3 flex items-baseline justify-between gap-4 text-sm">
          <span className="text-muted-foreground">
            {t("orders.total")}{" "}
            <span className="tabular text-foreground text-base font-medium">
              {formatMoney(total, locale)}
            </span>
          </span>
          <span className="text-muted-foreground">
            {t("orders.balance")}{" "}
            <span
              className={cn(
                "tabular font-medium",
                balance > 0 ? "text-warning-foreground" : "text-foreground",
              )}
            >
              {formatMoney(balance, locale)}
            </span>
          </span>
        </div>

        {issueCount > 0 && (
          <p
            className="text-destructive mb-2 flex items-center gap-2 text-sm"
            role="status"
          >
            <AlertCircle className="size-4 shrink-0" aria-hidden />
            {t("orders.fieldsToFix", {
              count: formatNumber(issueCount, locale),
            })}
          </p>
        )}

        {edit ? (
          // Modification : enregistrer, ou revenir à la fiche sans rien changer.
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Button
              type="submit"
              value="save"
              disabled={isPending}
              className="h-12 text-base"
            >
              {isPending && <Spinner />}
              {t("orders.edit.save")}
            </Button>
            <Button asChild variant="outline" className="h-12 px-4 text-base">
              <Link href={`/commandes/${edit.orderId}`}>
                {t("common.cancel")}
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Button
              type="submit"
              value="save"
              disabled={isPending}
              className="h-12 text-base"
            >
              {isPending && <Spinner />}
              {t("orders.quick.save")}
            </Button>
            <Button
              type="submit"
              value="another"
              variant="outline"
              disabled={isPending}
              className="h-12 px-4 text-base"
            >
              <Plus className="size-4" aria-hidden />
              {t("orders.quick.saveAnother")}
            </Button>
          </div>
        )}
      </div>

      {picker && (
        <ListPicker
          key={picker.n}
          open={picker.open}
          onOpenChange={(open) => (open ? null : closePicker())}
          title={
            sizedSlot(picker.index)
              ? sizedTitle(picker.index)
              : slotLabel(picker.index)
          }
          options={pickerOptions(picker.index)}
          selected={selectedKeys(picker.index)}
          onDone={(keys) => applyPicked(picker.index, keys)}
          // Veste, gilet, pantalon : du stock seulement.
          allowNew={
            !partOfSlot(picker.index) &&
            !STOCK_ONLY_SLOTS.has(catalogSlotOf(picker.index) ?? 0)
          }
          // Les cases fixes : un toucher choisit et referme.
          // « + Autre pièce » garde ses cases à cocher et « Valider »
          // (cravate + ceinture…).
          instant={picker.index < FIXED_SLOTS}
          emptyText={
            sizedSlot(picker.index)
              ? draft.slots[picker.index]?.size.trim()
                ? t("orders.quick.noPartInSize", {
                    part: slotLabel(picker.index),
                    size: draft.slots[picker.index].size.trim(),
                  })
                : t("orders.quick.noPart", { part: slotLabel(picker.index) })
              : undefined
          }
        />
      )}

      {sizePicker && (
        <SizePicker
          key={sizePicker.n}
          open={sizePicker.open}
          onOpenChange={(open) =>
            open ? null : setSizePicker({ ...sizePicker, open: false })
          }
          title={`${t("stock.size")} · ${slotLabel(sizePicker.index)}`}
          sizes={slotSizes(sizePicker.index)}
          value={draft.slots[sizePicker.index]?.size ?? ""}
          onPick={(value) => pickSize(sizePicker.index, value)}
        />
      )}

      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        icon={<Eraser className="size-4" />}
        title={t("orders.quick.clearTitle")}
        description={t("orders.quick.clearBody")}
        confirmLabel={t("orders.quick.clear")}
        onConfirm={async () => {
          reset(false);
          setShowDates(false);
        }}
      />
    </form>
  );
}
