"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { flushSync } from "react-dom";
import { unstable_rethrow, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertCircle,
  AlertTriangle,
  CalendarRange,
  Check,
  CircleCheck,
  Eraser,
  Minus,
  Package,
  Plane,
  Plus,
  X,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { DatePicker, toCalendarDate } from "@/components/date-picker";
import { ConfirmDialog } from "@/components/confirm-dialog";
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
import { checkAvailability, createOrder, updateOrder } from "@/lib/actions/orders";
import { resolveUnitPrice, spreadOutfitPrice, toPayload, type DraftLine } from "@/lib/order-draft";
import { fieldErrorsOf, orderSchema } from "@/lib/validation/orders";
import { defaultWindow } from "@/lib/rental-range";
import { createDeviceSetting, createMemoryStore } from "@/lib/device-setting";
import {
  ACCESSORIES_SLOT,
  EMPTY_DRAFT,
  EMPTY_SLOT,
  FIXED_SLOTS,
  costumeSize,
  type QuickDraft,
  type Slot,
} from "@/lib/quick-draft";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
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
 * Quatre cases fixes (costume, chemise, chaussures, accessoires) comme les
 * colonnes de son AppSheet, puis des pièces en plus si besoin. Chaque case est du texte
 * libre ; une suggestion du stock la RATTACHE à une pièce réelle, qui seule
 * bloque des dates.
 *
 * Types et règles du brouillon : `src/lib/quick-draft.ts`.
 *
 * Gardé dans le téléphone (`localStorage`) à chaque frappe : un appel client
 * au milieu de la saisie ne fait rien perdre. En MODIFICATION, le brouillon
 * vit en mémoire et part de la commande en base (voir `edit`).
 * ------------------------------------------------------------------------ */

const draftStore = createDeviceSetting<QuickDraft>({
  key: "dd.quickOrder",
  fallback: EMPTY_DRAFT,
  sanitize: (value) => {
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
    } else if (d.v !== 2 || slots.length < FIXED_SLOTS) {
      return null;
    }
    return { ...EMPTY_DRAFT, ...d, v: 2, slots };
  },
});

/** Tant que le prix n'est pas tapé à la main, il vaut la somme des pièces du stock. */
function withAutoPrice(d: QuickDraft): QuickDraft {
  if (d.priceTouched) return d;
  const sum = d.slots.reduce((s, slot) => s + (slot.unitId ? (slot.stockPrice ?? 0) : 0), 0);
  return { ...d, price: sum > 0 ? String(sum) : "" };
}

function isDirty(d: QuickDraft): boolean {
  return (
    Boolean(d.customerName || d.customerPhone || d.eventDate || d.tailor || d.price) ||
    Boolean(d.paid || d.caution || d.notes || d.vestSize || d.pantsSize) ||
    d.pickedUp ||
    d.returned ||
    d.slots.some((s) => s.name || s.size)
  );
}

type FieldIssue = { key: string; values?: Record<string, string> };
type Issues = Partial<Record<string, FieldIssue>>;

/** Ordre À L'ÉCRAN : on ramène l'employé sur le premier champ fautif. */
const FIELD_TARGETS = [
  ["customer_name", "q-name"],
  ["customer_phone", "q-phone"],
  ["event_date", "q-date"],
  ["pickup_date", "q-pickup"],
  ["return_due_date", "q-return"],
  ["lines", "q-slot-0"],
  ["price", "q-price"],
  ["amount_paid", "q-paid"],
  ["caution_amount", "q-caution"],
  ["notes", "q-notes"],
] as const;

const EMPTY_BUSY = new Map<number, Unavailability>();

/** La liste « Taille » de son AppSheet : 44 à 66, de deux en deux. */
const SUIT_SIZES = Array.from({ length: 12 }, (_, i) => String(44 + i * 2));

/**
 * Catégories du stock montrées d'office dans chaque case (numérotée comme
 * `slot` des suggestions : 1 tenue, 2 chemise, 3 chaussures, 4 accessoires).
 */
const SLOT_CATEGORIES: Record<number, string[]> = {
  1: ["veste", "pantalon", "gilet"],
  2: ["chemise"],
  3: ["chaussures"],
  4: ["noeud", "accessoire"],
};

/** Pas des boutons − / + des montants : les prix se comptent en 500 DA. */
const MONEY_STEP = 500;

type SizeField = "jacket" | "vest" | "pants";
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
   */
  edit?: { orderId: number; orderNo: string; initial: QuickDraft };
}) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // En modification, un brouillon EN MÉMOIRE parti de la commande : le
  // brouillon de nouvelle commande gardé dans le téléphone n'est pas touché.
  const [store] = useState(() => (edit ? createMemoryStore(edit.initial) : draftStore));
  // Pendant l'envoi d'une nouvelle commande, la saisie affichée est figée
  // (voir `onSubmit`) : le brouillon stocké est déjà vidé.
  const [frozen, setFrozen] = useState<QuickDraft | null>(null);
  const live = store.useValue();
  const draft = frozen ?? live;

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
  const hasStock = useMemo(() => models.some((m) => m.units.length > 0), [models]);

  // Disponibilité du stock sur la fenêtre — pour GRISER, pas pour décider :
  // la contrainte `EXCLUDE` tranche à l'écriture. Sans stock, rien à demander.
  useEffect(() => {
    if (!hasStock || !windowKey) return;
    let cancelled = false;
    const [from, to] = windowKey.split("|");  // le 3e morceau est `recheck`
    // En modification, les pièces de CETTE commande ne sont pas « prises ».
    checkAvailability(from, to, edit?.orderId).then((busy) => {
      if (!cancelled) {
        setAvailability({ key: windowKey, busy: new Map(busy.map((b) => [b.unitId, b])) });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [hasStock, windowKey, edit?.orderId]);

  const busy = availability.key === windowKey ? availability.busy : EMPTY_BUSY;
  const isChecking = hasStock && Boolean(windowKey) && availability.key !== windowKey;

  // --- lignes envoyées -------------------------------------------------------
  const lines: DraftLine[] = useMemo(() => {
    const filled = draft.slots
      .map((slot, index) => ({ slot, index }))
      .filter(({ slot }) => slot.name.trim());

    // La colonne « Tailleur » va sur le costume, ou à défaut sur la 1re pièce.
    const tailorAt = filled.some((f) => f.index === 0) ? 0 : (filled[0]?.index ?? -1);
    const tailor = draft.tailor.trim() || null;

    const raw: DraftLine[] = filled.map(({ slot, index }) => {
      const note = index === tailorAt ? tailor : null;
      if (slot.external) {
        return {
          kind: "external",
          source: slot.external.source,
          label: slot.name.trim(),
          cost: slot.external.cost,
          unitPrice: 0,
          note,
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
          }
        : {
            kind: "named",
            name: slot.name.trim(),
            size:
              index === 0
                ? costumeSize(slot.size, draft.vestSize, draft.pantsSize)
                : slot.size.trim() || null,
            unitPrice: 0,
            note,
          };
    });
    return spreadOutfitPrice(raw, Number(draft.price) || 0);
  }, [draft.slots, draft.tailor, draft.price, draft.vestSize, draft.pantsSize]);

  const total = Number(draft.price) || 0;
  const balance = total - (Number(draft.paid) || 0);

  const takenSlots = draft.slots.filter((s) => s.unitId && busy.has(s.unitId));

  function collectIssues(): Issues {
    const parsed = orderSchema.safeParse({
      customer_name: draft.customerName,
      customer_phone: draft.customerPhone,
      event_date: draft.eventDate,
      pickup_date: pickup,
      return_due_date: returnDue,
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
    const w = defaultWindow(value, settings.days_before_event, settings.days_after_event);
    updateDraft({ eventDate: value, pickup: w.pickup, returnDue: w.returnDue });
  }

  function setSlot(index: number, patch: Partial<Slot>) {
    setServerIssue(null);
    const slots = store.get().slots.map((s, i) => (i === index ? { ...s, ...patch } : s));
    updateDraft({ slots });
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
  const [picker, setPicker] = useState<{ index: number; n: number; open: boolean } | null>(null);
  const [sizePicker, setSizePicker] = useState<{ field: SizeField; n: number; open: boolean } | null>(
    null,
  );

  const pickedUnits = new Set(draft.slots.map((s) => s.unitId).filter(Boolean));

  /** Pièces du stock par id, avec leur nom affiché et leur prix. */
  const unitIndex = useMemo(() => {
    const map = new Map<
      number,
      { model: PickerModel; unit: PickerModel["units"][number]; name: string; price: number }
    >();
    for (const model of models) {
      const name = (locale === "ar" ? model.name_ar : model.name_fr) || model.name_fr;
      for (const unit of model.units) {
        map.set(unit.id, { model, unit, name, price: resolveUnitPrice(model, unit) });
      }
    }
    return map;
  }, [models, locale]);


  function pickerOptions(index: number): PickerOption[] {
    const slotNo = Math.min(index + 1, 4);
    // Une pièce EN PLUS peut être n'importe quoi : tout est proposé.
    const extra = index >= FIXED_SLOTS;
    const own = draft.slots[index];
    const options: PickerOption[] = [];

    // 1. Le stock d'abord : c'est la seule pièce dont on garantit les dates.
    for (const [id, { model, unit, name, price }] of unitIndex) {
      const blocked = busy.get(id);
      const material = unit.status !== "disponible";
      const elsewhere = pickedUnits.has(id) && own.unitId !== id;

      let reason: string | null = null;
      if (!windowValid) reason = t("orders.quick.dateFirst");
      else if (material) reason = t(unit.status === "nettoyage" ? "stock.cleaning" : "stock.repair");
      else if (blocked)
        reason = blocked.freeFrom
          ? t("orders.freeFrom", { date: formatDate(blocked.freeFrom, locale) })
          : t("orders.takenOnDates");

      options.push({
        key: `u:${id}`,
        label: `${name} · ${unit.ref_code}`,
        secondary: (
          <>
            <Package className="text-gold-strong me-1 inline size-3" aria-hidden />
            {unit.size && `${t("stock.size")} ${unit.size}`}
            {reason && <span className="text-warning-foreground"> · {reason}</span>}
          </>
        ),
        trailing: <span className="tabular">{formatMoney(price, locale)}</span>,
        disabled: !windowValid || elsewhere || material || Boolean(blocked),
        featured: extra || SLOT_CATEGORIES[slotNo]?.includes(model.category_slug ?? ""),
      });
    }

    // 2. Ses vêtements déjà saisis — ceux de CETTE case montrés d'office.
    // Dans l'ordre de SES listes (`item-catalog`), pas l'ordre alphabétique.
    for (const item of items) {
      options.push({ key: `h:${item.label}`, label: item.label, featured: extra || item.slot === slotNo });
    }
    return options;
  }

  /** La valeur actuelle d'une case, sous forme de clé de la liste. */
  function selectedKeys(index: number): string[] {
    const slot = draft.slots[index];
    if (slot.unitId) return [`u:${slot.unitId}`];
    const name = slot.name.trim();
    if (!name) return [];
    const known = items.find((i) => normalizeSearch(i.label) === normalizeSearch(name));
    return [known ? `h:${known.label}` : NEW_KEY + name];
  }

  function slotFromKey(key: string): Partial<Slot> | null {
    if (key.startsWith(NEW_KEY)) {
      return { name: key.slice(NEW_KEY.length), unitId: null, ref: null, stockPrice: null, external: null };
    }
    if (key.startsWith("h:")) {
      return { name: key.slice(2), unitId: null, ref: null, stockPrice: null, external: null };
    }
    const found = unitIndex.get(Number(key.slice(2)));
    if (!found) return null;
    return {
      name: found.name,
      size: found.unit.size ?? "",
      unitId: found.unit.id,
      ref: found.unit.ref_code,
      stockPrice: found.price,
      external: null,
    };
  }

  /**
   * Applique la liste cochée à une case. Comme dans AppSheet on peut en cocher
   * PLUSIEURS : la première remplit la case, les suivantes deviennent des
   * pièces en plus — deux chemises, deux cravates.
   */
  function applyPicked(index: number, keys: string[]) {
    setServerIssue(null);
    const picks = keys.map(slotFromKey).filter((p): p is Partial<Slot> => p !== null);
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
      slots[index] = { ...base, ...first, size: first.unitId ? (first.size ?? "") : keptSize };
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
    if (picker.index >= FIXED_SLOTS && slot && !slot.name.trim()) removeSlot(picker.index);
    setPicker({ ...picker, open: false });
  }

  /** « + Autre pièce » : une case en plus, et sa liste ouverte d'emblée. */
  function addSlotAndPick() {
    const slots = store.get().slots;
    updateDraft({ slots: [...slots, EMPTY_SLOT] });
    openPicker(slots.length);
  }

  const sizeValue = (field: SizeField) =>
    field === "jacket" ? (draft.slots[0]?.size ?? "") : field === "vest" ? draft.vestSize : draft.pantsSize;

  function pickSize(field: SizeField, value: string) {
    if (field === "jacket") setSlot(0, { size: value });
    else if (field === "vest") updateDraft({ vestSize: value });
    else updateDraft({ pantsSize: value });
    setSizePicker((p) => (p ? { ...p, open: false } : p));
  }

  const sizeTitle = (field: SizeField) =>
    field === "jacket"
      ? t("orders.quick.sizeJacketLong")
      : field === "vest"
        ? t("orders.quick.sizeVest")
        : t("orders.quick.sizePants");

  const customerOptions: SuggestOption[] = (() => {
    const q = normalizeSearch(draft.customerName);
    if (q.length < 2) return [];
    return customers
      .filter(
        (c) =>
          normalizeSearch(c.name).includes(q) &&
          !(normalizeSearch(c.name) === q && (c.phone ?? "") === draft.customerPhone),
      )
      .slice(0, MAX_SUGGESTIONS)
      .map((c) => ({
        key: `${c.name}|${c.phone ?? ""}`,
        primary: c.name,
        secondary: c.phone ? <bdi dir="ltr">{c.phone}</bdi> : undefined,
        onPick: () => updateDraft({ customerName: c.name, customerPhone: c.phone ?? "" }),
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
    formData.set("pickup_date", pickup);
    formData.set("return_due_date", returnDue);
    formData.set("discount", "0");
    formData.set("amount_paid", draft.paid);
    formData.set("caution_amount", draft.caution);
    formData.set("notes", draft.notes);
    formData.set("picked_up", draft.pickedUp ? "1" : "0");
    formData.set("returned", draft.returned ? "1" : "0");
    formData.set("lines", JSON.stringify(toPayload(lines)));
    const name = draft.customerName.trim();

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
        // Réseau coupé : la saisie n'est pas perdue.
        restore();
        setGeneralError({ key: "errors.generic" });
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
          action: { label: t("orders.quick.view"), onClick: () => router.push(href) },
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
      setGeneralError({ key: result.error, values: result.values });
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

  const slotLabel = (index: number) =>
    index === 0
      ? t("orders.quick.costume")
      : index === 1
        ? t("orders.quick.shirt")
        : index === 2
          ? t("orders.quick.shoes")
          : index === ACCESSORIES_SLOT
            ? t("orders.quick.accessories")
            : t("orders.quick.other");

  return (
    <form onSubmit={onSubmit} onKeyDown={onKeyDown} noValidate>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="font-heading text-xl font-medium">
          {edit ? t("orders.edit.title", { no: edit.orderNo }) : t("orders.newTitle")}
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
            {issues.customer_name && <FieldError>{issueText("customer_name")}</FieldError>}
          </Field>

          <Field data-invalid={!!issues.customer_phone || undefined}>
            <FieldLabel htmlFor="q-phone">{t("orders.quick.phoneOptional")}</FieldLabel>
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
            {issues.customer_phone && <FieldError>{issueText("customer_phone")}</FieldError>}
          </Field>

          <Field data-invalid={!!issues.event_date || undefined}>
            <FieldLabel htmlFor="q-date">
              {t("orders.eventDate")}
              <RequiredMark />
            </FieldLabel>
            <DatePicker
              id="q-date"
              value={draft.eventDate}
              onChange={onEventDateChange}
              placeholder={t("common.pickDate")}
              invalid={!!issues.event_date}
            />
            {issues.event_date && <FieldError>{issueText("event_date")}</FieldError>}

            {windowLabel && (
              <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 text-sm">
                <span className="flex items-center gap-1.5">
                  <CalendarRange className="text-gold-strong size-4 shrink-0" aria-hidden />
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

          {draft.eventDate && showDates && (
              <div className="grid grid-cols-2 gap-3">
                <Field data-invalid={!!issues.pickup_date || undefined}>
                  <FieldLabel htmlFor="q-pickup">{t("orders.pickupDate")}</FieldLabel>
                  <DatePicker
                    id="q-pickup"
                    value={pickup}
                    onChange={(v) => updateDraft({ pickup: v, datesTouched: true })}
                    invalid={!!issues.pickup_date}
                    disabledDays={returnDue ? { after: toCalendarDate(returnDue) } : undefined}
                  />
                  {issues.pickup_date && <FieldError>{issueText("pickup_date")}</FieldError>}
                </Field>
                <Field data-invalid={!!issues.return_due_date || undefined}>
                  <FieldLabel htmlFor="q-return">{t("orders.returnDate")}</FieldLabel>
                  <DatePicker
                    id="q-return"
                    value={returnDue}
                    onChange={(v) => updateDraft({ returnDue: v, datesTouched: true })}
                    invalid={!!issues.return_due_date}
                    disabledDays={pickup ? { before: toCalendarDate(pickup) } : undefined}
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
          <div className="grid grid-cols-2 gap-3">
            <FlagToggle
              icon={<Plane className="size-4 rtl:-scale-x-100" aria-hidden />}
              label={t("orders.pickedUp")}
              checked={draft.pickedUp}
              // Décocher la sortie décoche aussi le retour : une tenue ne
              // revient pas sans être partie.
              onChange={(v) => updateDraft({ pickedUp: v, returned: v && draft.returned })}
            />
            <FlagToggle
              icon={<CircleCheck className="size-4" aria-hidden />}
              label={t("orders.returned")}
              checked={draft.returned}
              onChange={(v) => updateDraft({ returned: v, pickedUp: v || draft.pickedUp })}
            />
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
        aside={isChecking ? <Spinner className="text-muted-foreground" /> : null}
      >
        <p className="text-muted-foreground -mt-2 mb-4 text-sm">{t("orders.quick.outfitHint")}</p>

        <div className="space-y-4">
          {draft.slots.map((slot, index) => {
            const taken = slot.unitId ? busy.get(slot.unitId) : undefined;
            return (
              <div key={index}>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label htmlFor={`q-slot-${index}`} className="text-sm font-medium">
                    {slotLabel(index)}
                  </label>
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
                ) : (
                  <PickerField
                    id={`q-slot-${index}`}
                    value={slot.name}
                    placeholder={t("orders.quick.pickPlaceholder")}
                    onOpen={() => openPicker(index)}
                    onClear={() => applyPicked(index, [])}
                    invalid={!!issues.lines && index === 0}
                    // Une ancienne saisie avec sa taille à part (avant les
                    // listes) : on la montre plutôt que de la perdre de vue.
                    secondary={
                      index > 0 && !slot.unitId && slot.size ? (
                        <span className="text-muted-foreground">
                          {t("orders.quick.size")} {slot.size}
                        </span>
                      ) : undefined
                    }
                  />
                )}

                {slot.unitId && (
                  <p
                    className={cn(
                      "mt-1.5 flex items-center gap-1.5 text-xs",
                      taken ? "text-warning-foreground font-medium" : "text-success",
                    )}
                  >
                    {taken ? (
                      <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
                    ) : (
                      <Package className="size-3.5 shrink-0" aria-hidden />
                    )}
                    {t("orders.quick.fromStock")} <bdi>{slot.ref}</bdi>
                    {slot.size && ` · ${t("stock.size")} ${slot.size}`}
                    {taken &&
                      ` · ${
                        taken.freeFrom
                          ? t("orders.freeFrom", { date: formatDate(taken.freeFrom, locale) })
                          : t("orders.takenOnDates")
                      }`}
                  </p>
                )}

                {/* Sous le costume : Taille, Taille Gelly, Taille pantalon —
                    les trois listes 44…66 de son AppSheet, côte à côte. Une
                    pièce du stock a déjà sa taille : on ne la redemande pas. */}
                {index === 0 && !slot.unitId && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {(["jacket", "vest", "pants"] as const).map((field) => (
                      <div key={field} className="min-w-0">
                        <span
                          id={`q-size-${field}-label`}
                          className="text-muted-foreground mb-1 block truncate text-xs"
                        >
                          {field === "jacket"
                            ? t("orders.quick.sizeJacket")
                            : field === "vest"
                              ? t("orders.quick.sizeVestShort")
                              : t("orders.quick.sizePantsShort")}
                        </span>
                        <button
                          type="button"
                          id={`q-size-${field}`}
                          aria-labelledby={`q-size-${field}-label q-size-${field}`}
                          onClick={() => setSizePicker({ field, n: Date.now(), open: true })}
                          className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 tabular flex h-12 w-full items-center justify-center gap-1 rounded-md border text-base outline-none focus-visible:ring-[3px]"
                        >
                          {sizeValue(field) ||
                            // Pantalon vide = même taille que la veste : on
                            // l'affiche en filigrane, c'est ce qui sera retenu.
                            (field === "pants" && slot.size ? (
                              <span className="text-muted-foreground">{slot.size}</span>
                            ) : (
                              <Plus className="text-muted-foreground size-4" aria-hidden />
                            ))}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* La colonne « Tailleur » : texte libre (« TK-525 (14CM) »). */}
                {index === 0 && (
                  <div className="mt-3">
                    <label htmlFor="q-tailor" className="text-muted-foreground mb-1 block text-xs">
                      {t("orders.quick.tailor")}
                    </label>
                    <Input
                      id="q-tailor"
                      data-field
                      value={draft.tailor}
                      onChange={(e) => updateDraft({ tailor: e.target.value })}
                      placeholder={t("orders.quick.tailorPlaceholder")}
                      enterKeyHint="next"
                      autoComplete="off"
                      className="h-12 text-base"
                    />
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

        <Button
          type="button"
          variant="outline"
          onClick={addSlotAndPick}
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
            {issues.amount_paid && <FieldError>{issueText("amount_paid")}</FieldError>}
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
              {t("orders.quick.paidAll", { amount: formatMoney(total, locale) })}
            </Button>
          )}

          {/* REST : calculé, jamais saisi — comme la colonne générée en base. */}
          <div>
            <p className="mb-1.5 text-sm font-medium">{t("orders.balance")}</p>
            <p
              className={cn(
                "bg-muted/60 tabular flex h-12 items-center rounded-md px-3 text-base",
                balance > 0 ? "text-warning-foreground font-medium" : "text-muted-foreground",
              )}
              aria-live="polite"
            >
              {formatMoney(balance, locale)}
            </p>
          </div>

          <Field data-invalid={!!issues.caution_amount || undefined}>
            <FieldLabel htmlFor="q-caution">{t("orders.caution")}</FieldLabel>
            <MoneyStepper
              id="q-caution"
              value={draft.caution}
              onChange={(v) => updateDraft({ caution: v })}
              invalid={!!issues.caution_amount}
            />
            {issues.caution_amount && <FieldError>{issueText("caution_amount")}</FieldError>}
          </Field>

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
          <AlertDescription>{t(generalError.key, generalError.values)}</AlertDescription>
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
          <p className="text-destructive mb-2 flex items-center gap-2 text-sm" role="status">
            <AlertCircle className="size-4 shrink-0" aria-hidden />
            {t("orders.fieldsToFix", { count: formatNumber(issueCount, locale) })}
          </p>
        )}

        {edit ? (
          // Modification : enregistrer, ou revenir à la fiche sans rien changer.
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Button type="submit" value="save" disabled={isPending} className="h-12 text-base">
              {isPending && <Spinner />}
              {t("orders.edit.save")}
            </Button>
            <Button asChild variant="outline" className="h-12 px-4 text-base">
              <Link href={`/commandes/${edit.orderId}`}>{t("common.cancel")}</Link>
            </Button>
          </div>
        ) : (
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Button type="submit" value="save" disabled={isPending} className="h-12 text-base">
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
          title={slotLabel(picker.index)}
          options={pickerOptions(picker.index)}
          selected={selectedKeys(picker.index)}
          onDone={(keys) => applyPicked(picker.index, keys)}
        />
      )}

      {sizePicker && (
        <SizePicker
          key={sizePicker.n}
          open={sizePicker.open}
          onOpenChange={(open) => (open ? null : setSizePicker({ ...sizePicker, open: false }))}
          title={sizeTitle(sizePicker.field)}
          sizes={SUIT_SIZES}
          value={sizeValue(sizePicker.field)}
          onPick={(value) => pickSize(sizePicker.field, value)}
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

/**
 * Un montant avec les boutons − / + de son AppSheet. Le pas est de 500 DA :
 * à 1 DA comme dans AppSheet, les boutons ne servaient à rien. Le clavier
 * numérique reste là pour un montant exact.
 */
function MoneyStepper({
  id,
  value,
  onChange,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
}) {
  const t = useTranslations();
  const current = Number(value) || 0;
  const step = (delta: number) => onChange(String(Math.max(0, current + delta)));

  return (
    <div className="flex gap-1.5">
      <Input
        id={id}
        data-field
        type="number"
        inputMode="numeric"
        min={0}
        step={MONEY_STEP}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        enterKeyHint="next"
        className="tabular h-12 min-w-0 flex-1 text-base"
        aria-invalid={invalid || undefined}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-12 shrink-0"
        onClick={() => step(-MONEY_STEP)}
        disabled={current <= 0}
        aria-label={t("orders.quick.stepDown", { step: MONEY_STEP })}
      >
        <Minus className="size-5" aria-hidden />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-12 shrink-0"
        onClick={() => step(MONEY_STEP)}
        aria-label={t("orders.quick.stepUp", { step: MONEY_STEP })}
      >
        <Plus className="size-5" aria-hidden />
      </Button>
    </div>
  );
}

/** Une case ✗ / ✓ de son formulaire AppSheet, en bouton à bascule de 48 px. */
function FlagToggle({
  icon,
  label,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex min-h-12 items-center gap-2 rounded-lg border px-3 text-start text-sm transition-colors",
        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
        checked
          ? "border-gold-strong bg-gold-soft font-medium"
          : "border-border bg-card hover:border-gold-strong",
      )}
    >
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-md border",
          checked
            ? "bg-primary text-primary-foreground border-transparent"
            : "border-border bg-background text-muted-foreground",
        )}
        aria-hidden
      >
        {checked ? <Check className="size-4" /> : <X className="size-3.5" />}
      </span>
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

function RequiredMark() {
  return (
    <span className="text-destructive ms-0.5" aria-hidden>
      *
    </span>
  );
}

/** Une section : filet en tête plutôt qu'une carte, pour garder la largeur. */
function Section({
  id,
  title,
  aside,
  invalid,
  children,
}: {
  id: string;
  title: React.ReactNode;
  aside?: React.ReactNode;
  invalid?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      tabIndex={-1}
      aria-labelledby={`${id}-title`}
      className="border-border scroll-mt-20 border-t pt-5 pb-6 outline-none first-of-type:border-t-0 first-of-type:pt-0"
    >
      <div className="mb-4 flex items-center gap-2">
        <h2 id={`${id}-title`} className={cn("text-lg font-medium", invalid && "text-destructive")}>
          {title}
        </h2>
        {aside && <span className="ms-auto">{aside}</span>}
      </div>
      {children}
    </section>
  );
}
