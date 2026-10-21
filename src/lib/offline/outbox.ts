/**
 * La file des gestes faits SANS RÉSEAU — navigateur uniquement.
 *
 * Un geste passe par `sendOrQueue()` :
 *   - en ligne, il part tout de suite vers sa Server Action, comme avant ;
 *   - hors ligne (ou si la requête n'a pas pu partir), il est gardé dans
 *     IndexedDB et l'écran le montre « en attente ».
 * `flushOutbox()` renvoie la file, dans l'ordre, au retour du réseau. Un geste
 * refusé par la base reste dans la file, marqué refusé, avec la raison : rien
 * ne disparaît en silence.
 *
 * POURQUOI ON PEUT RENVOYER SANS CRAINTE — ✈ / ✓ et le pointage POSENT une
 * valeur : deux envois donnent le même état. Un encaissement et un frais
 * AJOUTENT : ils portent un identifiant (`opId`) que la base n'accepte qu'une
 * fois (`client_op_id`). Une requête arrivée au serveur mais dont la réponse
 * s'est perdue peut donc repartir.
 *
 * Une COMMANDE saisie ou modifiée sans réseau est PROVISOIRE : elle attend
 * ici, et c'est la base qui la confirme ou la refuse au retour du réseau — la
 * contrainte EXCLUDE tranche, comme en ligne. Une création porte un
 * identifiant (`create_order_once`), une modification la version d'où elle
 * part (`update_order_checked`) : ni doublon, ni travail d'un collègue écrasé.
 */
import { addOrderPayment, createOrder, setOrderChecks, updateOrder } from "@/lib/actions/orders";
import { createExpense } from "@/lib/actions/expenses";
import { setMark, setMyMark } from "@/lib/actions/pointage";
import { idbClear, idbGet, idbSet, idbUpdate } from "@/lib/offline/store";
import type {
  OfflineCatalog,
  OfflineOrder,
  OfflineSnapshot,
  OutboxItem,
  OutboxOp,
} from "@/lib/offline/types";
import type { Unavailability } from "@/lib/queries/orders";
import { freeFrom, rangesOverlap, rentalRange } from "@/lib/rental-range";

const OUTBOX = "outbox";
const SNAPSHOT = "snapshot";
const CATALOG = "catalog";
/** Le catalogue (stock, clients, réservations) change peu : relu au plus toutes les 30 min. */
const CATALOG_MAX_AGE_MS = 30 * 60_000;

/** Émis à chaque changement de la file : l'indicateur se met à jour. */
export const OUTBOX_EVENT = "daydream:outbox";
/** Émis à chaque nouveau cliché. */
export const SNAPSHOT_EVENT = "daydream:snapshot";

type Context = { userId: string; locale: string };
let context: Context | null = null;

/** Posé par `<OfflineSync>` : à qui appartiennent les gestes, dans quelle langue. */
export function setOfflineContext(next: Context) {
  context = next;
}

export type SendResult =
  | { ok: true; queued: boolean }
  | { ok: false; error: string; field?: string; values?: Record<string, string> };

type ActionOutcome =
  | { ok: true }
  | { ok: false; error: string; field?: string; values?: Record<string, string> };

function emit(name: string) {
  window.dispatchEvent(new Event(name));
}

/**
 * La requête n'a pas pu partir — ou sa réponse n'est pas revenue. Une Server
 * Action sans réseau rejette une `TypeError` (« Failed to fetch », « Load
 * failed » sur iPhone). Toute autre erreur est un vrai bogue : on la laisse
 * remonter.
 */
export function isNetworkError(error: unknown): boolean {
  return !navigator.onLine || error instanceof TypeError;
}

/** Deux gestes sur la même case : seul le dernier compte. */
function sameTarget(a: OutboxOp, b: OutboxOp): boolean {
  if (a.kind === "check" && b.kind === "check") {
    return a.orderId === b.orderId && a.field === b.field;
  }
  if (a.kind === "mark" && b.kind === "mark") {
    return a.markKind === b.markKind && a.day === b.day && a.userId === b.userId;
  }
  // Deux modifications de la même commande : la seconde reprend tout.
  if (a.kind === "orderEdit" && b.kind === "orderEdit") return a.orderId === b.orderId;
  // Une modification porte déjà ✈ / ✓ : une coche en attente sur la même
  // commande ferait changer sa version, et la ferait refuser.
  if (a.kind === "check" && b.kind === "orderEdit") return a.orderId === b.orderId;
  return false;
}

export async function getOutbox(): Promise<OutboxItem[]> {
  return (await idbGet<OutboxItem[]>(OUTBOX)) ?? [];
}

/**
 * Met un geste en file SANS tenter l'envoi — pour le formulaire de commande,
 * qui a déjà essayé (ou sait qu'il n'y a pas de réseau).
 */
export async function queueOp(op: OutboxOp, title: string): Promise<void> {
  return enqueue(op, title);
}

async function enqueue(op: OutboxOp, title: string): Promise<void> {
  if (!context) throw new Error("offline context missing");
  const item: OutboxItem = {
    id: crypto.randomUUID(),
    userId: context.userId,
    createdAt: new Date().toISOString(),
    title,
    op,
    status: "pending",
  };
  await idbUpdate<OutboxItem[]>(OUTBOX, (items = []) => [
    ...items.filter((i) => !(i.status === "pending" && sameTarget(i.op, op))),
    item,
  ]);
  if (op.kind === "check") {
    await patchSnapshotOrder(op.orderId, { [op.field]: op.value });
  }
  emit(OUTBOX_EVENT);
}

export async function removeOutboxItem(id: string): Promise<void> {
  await idbUpdate<OutboxItem[]>(OUTBOX, (items = []) => items.filter((i) => i.id !== id));
  emit(OUTBOX_EVENT);
}

/** Remet un geste refusé dans la file : « Réessayer ». */
export async function retryOutboxItem(id: string): Promise<void> {
  await idbUpdate<OutboxItem[]>(OUTBOX, (items = []) =>
    items.map((i) => (i.id === id ? { ...i, status: "pending", error: undefined } : i)),
  );
  emit(OUTBOX_EVENT);
}

/** Les champs du formulaire de commande, plus ce que l'envoi différé ajoute. */
function orderFormData(fields: Record<string, string>, locale: string, extra: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  data.set("locale", locale);
  // Jamais de redirection depuis la file : l'action rend le résultat.
  data.set("return_id", "1");
  for (const [key, value] of Object.entries(extra)) data.set(key, value);
  return data;
}

/** L'appel réel d'un geste — la même Server Action qu'en ligne. */
async function send(op: OutboxOp, locale: string): Promise<ActionOutcome> {
  switch (op.kind) {
    case "order": {
      const result = await createOrder(orderFormData(op.fields, locale, { client_op_id: op.opId }));
      return result ?? { ok: true };
    }
    case "orderEdit": {
      const result = await updateOrder(
        orderFormData(op.fields, locale, {
          id: String(op.orderId),
          expected_version: String(op.expectedVersion),
        }),
      );
      return result ?? { ok: true };
    }
    case "check": {
      const data = new FormData();
      data.set("locale", locale);
      data.set("id", String(op.orderId));
      data.set("field", op.field);
      data.set("value", op.value ? "1" : "0");
      return setOrderChecks(data);
    }
    case "payment": {
      const data = new FormData();
      data.set("locale", locale);
      data.set("id", String(op.orderId));
      data.set("amount", String(op.amount));
      data.set("direction", op.direction);
      data.set("client_op_id", op.opId);
      return addOrderPayment(data);
    }
    case "expense": {
      const data = new FormData();
      data.set("locale", locale);
      data.set("spent_on", op.spent_on);
      data.set("category", op.category);
      data.set("amount", String(op.amount));
      data.set("description", op.description);
      data.set("order_id", op.order_id === null ? "" : String(op.order_id));
      data.set("client_op_id", op.opId);
      return createExpense(data);
    }
    case "mark":
      return op.userId
        ? setMark(locale, op.markKind, op.userId, op.day, op.on)
        : setMyMark(locale, op.markKind, op.day, op.on);
  }
}

/**
 * Le geste part tout de suite, ou rejoint la file s'il n'y a pas de réseau.
 * `title` est le libellé déjà traduit, montré dans la liste des gestes en
 * attente.
 */
export async function sendOrQueue(op: OutboxOp, title: string): Promise<SendResult> {
  const locale = context?.locale ?? "fr";
  if (navigator.onLine) {
    try {
      const result = await send(op, locale);
      return result.ok ? { ok: true, queued: false } : result;
    } catch (error) {
      if (!isNetworkError(error)) throw error;
    }
  }
  if (!context) return { ok: false, error: "errors.generic" };
  await enqueue(op, title);
  return { ok: true, queued: true };
}

let flushing: Promise<{ sent: number; rejected: number }> | null = null;

/**
 * Renvoie la file, dans l'ordre où les gestes ont été faits. S'arrête au
 * premier échec réseau (le reste attendra). Un seul envoi à la fois : deux
 * déclencheurs simultanés (retour du réseau + retour sur l'onglet) partagent
 * le même.
 */
export function flushOutbox(): Promise<{ sent: number; rejected: number }> {
  if (flushing) return flushing;
  flushing = (async () => {
    let sent = 0;
    let rejected = 0;
    if (!context || !navigator.onLine) return { sent, rejected };
    const { userId, locale } = context;
    const queue = (await getOutbox()).filter((i) => i.status === "pending" && i.userId === userId);

    for (const item of queue) {
      let result: Awaited<ReturnType<typeof send>>;
      try {
        result = await send(item.op, locale);
      } catch (error) {
        if (isNetworkError(error)) break;
        result = { ok: false, error: "errors.generic" };
      }
      if (result.ok) {
        sent++;
        await idbUpdate<OutboxItem[]>(OUTBOX, (items = []) => items.filter((i) => i.id !== item.id));
      } else {
        rejected++;
        const { error, values } = result;
        await idbUpdate<OutboxItem[]>(OUTBOX, (items = []) =>
          items.map((i) =>
            i.id === item.id ? { ...i, status: "rejected", error, errorValues: values } : i,
          ),
        );
      }
      emit(OUTBOX_EVENT);
    }
    return { sent, rejected };
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

/**
 * Change de compte sur le même téléphone : les gestes d'un autre ne partiront
 * jamais sous celui-ci, et son cliché ne se relit pas.
 */
export async function dropOtherUsers(userId: string): Promise<void> {
  const snapshot = await getSnapshot();
  if (snapshot && snapshot.userId !== userId) await idbSet(SNAPSHOT, undefined);
  const catalog = await getCatalog();
  if (catalog && catalog.userId !== userId) await idbSet(CATALOG, undefined);
  await idbUpdate<OutboxItem[]>(OUTBOX, (items = []) => items.filter((i) => i.userId === userId));
  emit(OUTBOX_EVENT);
}

// --- Cliché -------------------------------------------------------------------

export async function getSnapshot(): Promise<OfflineSnapshot | undefined> {
  return idbGet<OfflineSnapshot>(SNAPSHOT);
}

/** Va chercher le dernier état. Silencieux en cas d'échec : l'ancien reste. */
export async function refreshSnapshot(): Promise<void> {
  if (!navigator.onLine) return;
  try {
    const response = await fetch("/api/offline/snapshot", { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) return;
    const snapshot = (await response.json()) as OfflineSnapshot;
    await idbSet(SNAPSHOT, snapshot);
    emit(SNAPSHOT_EVENT);
  } catch {
    /* hors ligne entre-temps : l'ancien cliché reste */
  }
}

export async function getCatalog(): Promise<OfflineCatalog | undefined> {
  return idbGet<OfflineCatalog>(CATALOG);
}

/** Relit le catalogue s'il manque ou a plus de 30 minutes (`force` : tout de suite). */
export async function refreshCatalog(force = false): Promise<void> {
  if (!navigator.onLine) return;
  const current = await getCatalog();
  if (!force && current && Date.now() - Date.parse(current.syncedAt) < CATALOG_MAX_AGE_MS) return;
  try {
    const response = await fetch("/api/offline/catalog", { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) return;
    await idbSet(CATALOG, (await response.json()) as OfflineCatalog);
  } catch {
    /* hors ligne entre-temps : l'ancien catalogue reste */
  }
}

/**
 * Pièces PROBABLEMENT prises sur une fenêtre, d'après ce que sait le
 * téléphone : les réservations du dernier catalogue, plus les commandes
 * provisoires encore en file. Même forme que `checkAvailability` : le
 * formulaire grise ces pièces de la même façon.
 *
 * Ce n'est qu'un AVERTISSEMENT — un collègue a pu réserver depuis. La base
 * tranche à l'envoi.
 */
export async function localAvailability(
  pickup: string,
  returnDue: string,
  excludeOrderId?: number,
): Promise<Unavailability[]> {
  const catalog = await getCatalog();
  if (!catalog) return [];
  const buffer = catalog.settings.cleaning_buffer_days;
  const candidate = rentalRange(pickup, returnDue, buffer);
  const latest = new Map<number, Unavailability>();
  const take = (unitId: number, range: string, orderNo: string | null) => {
    if (!rangesOverlap(range, candidate)) return;
    const free = freeFrom(range);
    const current = latest.get(unitId);
    if (!current || (free && current.freeFrom && free > current.freeFrom)) {
      latest.set(unitId, { unitId, freeFrom: free, orderNo });
    }
  };
  for (const b of catalog.bookings) {
    if (b.orderId !== excludeOrderId) take(b.unitId, b.range, b.orderNo);
  }
  for (const item of await getOutbox()) {
    const op = item.op;
    if (op.kind !== "order" && op.kind !== "orderEdit") continue;
    if (op.kind === "orderEdit" && op.orderId === excludeOrderId) continue;
    const range = rentalRange(op.summary.pickup, op.summary.returnDue, buffer);
    for (const unitId of op.summary.unitIds) take(unitId, range, null);
  }
  return [...latest.values()];
}

/** Le geste fait hors ligne se voit tout de suite dans le cliché. */
async function patchSnapshotOrder(orderId: number, patch: Partial<OfflineOrder>): Promise<void> {
  await idbUpdate<OfflineSnapshot | undefined>(SNAPSHOT, (snapshot) =>
    snapshot
      ? {
          ...snapshot,
          orders: snapshot.orders.map((o) => (o.id === orderId ? { ...o, ...patch } : o)),
        }
      : snapshot,
  );
  emit(SNAPSHOT_EVENT);
}

/**
 * Déconnexion : un dernier envoi si le réseau le permet, puis tout s'efface —
 * les téléphones des clients n'ont rien à faire sur un appareil partagé.
 * Rend le nombre de gestes perdus (encore en attente faute de réseau).
 */
export async function clearOfflineData(): Promise<number> {
  await flushOutbox().catch(() => undefined);
  const left = (await getOutbox()).filter((i) => i.status === "pending").length;
  await idbClear();
  emit(OUTBOX_EVENT);
  return left;
}
