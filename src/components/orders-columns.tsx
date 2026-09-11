"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Check, SlidersHorizontal } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Colonnes réglables de la liste des commandes.
 *
 * Sur téléphone la liste reste en CARTES — un `<table>` ne passe pas à 390 px
 * (règle `daydream-ui`). Le réglage pilote donc les champs affichés sur la
 * carte en mobile, et les colonnes du tableau en `md:` et au-delà. C'est la
 * seule façon honnête de rendre « des colonnes » utiles au pouce.
 */
export const ORDER_COLUMNS = [
  "order_no",
  "customer_name",
  "customer_phone",
  "event_date",
  "pickup_date",
  "status",
  "total_price",
  "amount_paid",
  "balance",
  "caution_amount",
] as const;

export type OrderColumn = (typeof ORDER_COLUMNS)[number];

/** Le nom du client identifie la ligne : il ne se masque pas. */
export const LOCKED_COLUMN: OrderColumn = "customer_name";

export const DEFAULT_COLUMNS: OrderColumn[] = [
  "customer_name",
  "order_no",
  "event_date",
  "status",
  "total_price",
  "balance",
];

export const COLUMN_LABEL_KEYS: Record<OrderColumn, string> = {
  order_no: "orders.orderNo",
  customer_name: "orders.customer",
  customer_phone: "orders.phone",
  event_date: "orders.eventDate",
  pickup_date: "orders.pickupDate",
  status: "orders.statusLabel",
  total_price: "orders.total",
  amount_paid: "orders.paid",
  balance: "orders.balance",
  caution_amount: "orders.caution",
};

const STORAGE_KEY = "daydream.orders.columns";

function sanitize(value: unknown): OrderColumn[] | null {
  if (!Array.isArray(value)) return null;
  const kept = ORDER_COLUMNS.filter((c) => value.includes(c));
  if (!kept.includes(LOCKED_COLUMN)) kept.unshift(LOCKED_COLUMN);
  return kept.length ? kept : null;
}

/* --------------------------------------------------------------------------
 * Préférence stockée PAR APPAREIL, volontairement.
 *
 * Le patron ne veut pas les mêmes colonnes sur son téléphone que sur un grand
 * écran. `localStorage` évite en plus une table et une migration pour un
 * réglage de confort.
 *
 * Implémenté en `useSyncExternalStore` plutôt qu'en `useState` + `useEffect` :
 * le serveur ne peut pas connaître ce choix, donc le rendu serveur part des
 * valeurs par défaut (`getServerSnapshot`) et le client bascule sans
 * divergence d'hydratation. Bonus : l'événement `storage` synchronise les
 * onglets ouverts.
 *
 * La valeur vit en mémoire ET dans le stockage : si le stockage est bloqué
 * (navigation privée), le réglage tient au moins pour la session au lieu de
 * paraître sans effet.
 * ------------------------------------------------------------------------ */

let current: OrderColumn[] | null = null;
const listeners = new Set<() => void>();

function getSnapshot(): OrderColumn[] {
  if (current === null) {
    let stored: OrderColumn[] | null = null;
    try {
      stored = sanitize(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"));
    } catch {
      /* stockage bloqué ou contenu illisible : valeurs par défaut. */
    }
    current = stored ?? DEFAULT_COLUMNS;
  }
  return current;
}

function getServerSnapshot(): OrderColumn[] {
  return DEFAULT_COLUMNS;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      current = null; // forcer la relecture
      onChange();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function publish(next: OrderColumn[]): void {
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* le réglage vaut pour la session, faute de mieux. */
  }
  for (const listener of listeners) listener();
}

export function useOrderColumns() {
  const columns = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback((column: OrderColumn) => {
    if (column === LOCKED_COLUMN) return;
    const prev = getSnapshot();
    publish(
      prev.includes(column)
        ? prev.filter((c) => c !== column)
        : ORDER_COLUMNS.filter((c) => c === column || prev.includes(c)),
    );
  }, []);

  return { columns, toggle };
}

export function OrderColumnsDrawer({
  columns,
  onToggle,
}: {
  columns: OrderColumn[];
  onToggle: (column: OrderColumn) => void;
}) {
  const t = useTranslations();

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button variant="outline" className="h-11">
          <SlidersHorizontal className="size-4" aria-hidden />
          {t("orders.columns")}
        </Button>
      </DrawerTrigger>

      <DrawerContent className="max-h-[85svh]">
        <DrawerHeader className="text-start">
          <DrawerTitle>{t("orders.columns")}</DrawerTitle>
          <DrawerDescription>{t("orders.columnsHint")}</DrawerDescription>
        </DrawerHeader>

        <ul className="flex-1 overflow-y-auto px-4 pb-6">
          {ORDER_COLUMNS.map((column) => {
            const checked = columns.includes(column);
            const locked = column === LOCKED_COLUMN;
            return (
              <li key={column}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  disabled={locked}
                  onClick={() => onToggle(column)}
                  className={cn(
                    "flex min-h-12 w-full items-center gap-3 rounded-md px-2 text-start",
                    locked ? "opacity-55" : "hover:bg-accent",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded border",
                      checked
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border",
                    )}
                    aria-hidden
                  >
                    {checked && <Check className="size-3.5" />}
                  </span>
                  <span className="flex-1 text-sm">{t(COLUMN_LABEL_KEYS[column])}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </DrawerContent>
    </Drawer>
  );
}
