"use client";

import { useSyncExternalStore } from "react";
import { sanitizeQuickDraft, type QuickDraft } from "@/lib/quick-draft";
import { rangesOverlap, rentalRange } from "@/lib/rental-range";

/**
 * Commandes EN ATTENTE — plusieurs clients servis en même temps sur UN téléphone.
 *
 * Le client A cherche encore sa chemise, le client B a fini : l'employé met A
 * en attente, termine B, puis reprend A là où il l'avait laissé. Une saisie en
 * attente reste DANS LE TÉLÉPHONE (`localStorage`) : rien n'existe en base
 * avant « Enregistrer ».
 *
 * La saisie active, elle, reste à sa place (`dd.quickOrder`) : seules les
 * saisies mises de côté vivent ici.
 */

export type ParkedDraft = {
  id: string;
  /** ISO — l'ordre d'arrivée des clients. */
  parkedAt: string;
  draft: QuickDraft;
};

const KEY = "dd.quickOrders.parked";
const EMPTY: ParkedDraft[] = [];

let cache: { raw: string | null; list: ParkedDraft[] } | null = null;
const listeners = new Set<() => void>();

function read(): ParkedDraft[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return cache?.list ?? EMPTY;
  }
  if (cache && cache.raw === raw) return cache.list;
  let list: ParkedDraft[] = [];
  try {
    const parsed: unknown = JSON.parse(raw ?? "[]");
    if (Array.isArray(parsed)) {
      for (const item of parsed as Partial<ParkedDraft>[]) {
        const draft = sanitizeQuickDraft(item?.draft);
        if (!draft || typeof item.id !== "string") continue;
        list.push({ id: item.id, parkedAt: String(item.parkedAt ?? ""), draft });
      }
    }
  } catch {
    list = [];
  }
  cache = { raw, list };
  return list;
}

function write(list: ParkedDraft[]) {
  const raw = JSON.stringify(list);
  cache = { raw, list };
  try {
    localStorage.setItem(KEY, raw);
  } catch {
    /* le téléphone refuse : la liste vaut pour la session, faute de mieux. */
  }
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // Un autre onglet du même téléphone met un client en attente.
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Les clients en attente, du plus ancien au plus récent. */
export function useParked(): ParkedDraft[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function getParked(): ParkedDraft[] {
  return read();
}

/** Met une saisie en attente. */
export function park(draft: QuickDraft): void {
  write([
    ...read(),
    { id: crypto.randomUUID(), parkedAt: new Date().toISOString(), draft },
  ]);
}

/** Reprend un client : sa saisie quitte la file et revient au formulaire. */
export function take(id: string): QuickDraft | null {
  const list = read();
  const found = list.find((p) => p.id === id);
  if (!found) return null;
  write(list.filter((p) => p.id !== id));
  return found.draft;
}

export function discard(id: string): void {
  write(read().filter((p) => p.id !== id));
}

/**
 * Pièces du stock tenues par un client EN ATTENTE sur des dates qui
 * chevauchent la fenêtre — même règle que la base (`rentalRange`, battement
 * de nettoyage compris). Pièce → prénom du client qui la tient.
 *
 * Rien n'est réservé en base : c'est le téléphone qui empêche deux clients
 * présents dans la boutique de prendre la même veste. Un collègue sur un autre
 * téléphone, lui, sera arrêté par la contrainte `EXCLUDE` à l'envoi.
 */
export function parkedHolds(
  parked: ParkedDraft[],
  pickup: string,
  returnDue: string,
  cleaningBufferDays: number,
): Map<number, string> {
  const holds = new Map<number, string>();
  if (!pickup || !returnDue || returnDue < pickup) return holds;
  const candidate = rentalRange(pickup, returnDue, cleaningBufferDays);
  for (const { draft } of parked) {
    if (!draft.pickup || !draft.returnDue || draft.returnDue < draft.pickup) continue;
    const range = rentalRange(draft.pickup, draft.returnDue, cleaningBufferDays);
    if (!rangesOverlap(range, candidate)) continue;
    for (const slot of draft.slots) {
      if (slot.unitId && slot.name.trim() && !holds.has(slot.unitId)) {
        holds.set(slot.unitId, draft.customerName.trim());
      }
    }
  }
  return holds;
}

/** Les pièces saisies d'un client en attente — le compte affiché sur sa puce. */
export function filledCount(draft: QuickDraft): number {
  return draft.slots.filter((s) => s.name.trim()).length;
}
