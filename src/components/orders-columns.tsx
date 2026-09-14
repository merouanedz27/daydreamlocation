"use client";

import { useCallback } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createDeviceSetting, useMediaQuery } from "@/lib/device-setting";
import { cn } from "@/lib/utils";
import type { ListView } from "@/components/view-toggle";

/**
 * Colonnes réglables de la liste des commandes.
 *
 * Elles pilotent les deux affichages : les lignes de chaque carte en mode
 * Liste, les colonnes en mode Tableau. Le tableau ne défile JAMAIS de côté :
 * il n'affiche que les premières colonnes cochées quand l'écran est étroit
 * (voir `TABLE_LIMITS`).
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

/**
 * Libellés COURTS des en-têtes du tableau, comme dans un tableur : « Date de
 * l'événement » coupé en trois lignes sur une colonne de 80 px ne se lit plus.
 * Le libellé complet reste sur les cartes et dans le réglage des colonnes.
 */
export const COLUMN_SHORT_KEYS: Record<OrderColumn, string> = {
  order_no: "orders.short.orderNo",
  customer_name: "orders.short.customer",
  customer_phone: "orders.short.phone",
  event_date: "orders.short.eventDate",
  pickup_date: "orders.short.pickupDate",
  status: "orders.short.status",
  total_price: "orders.short.total",
  amount_paid: "orders.short.paid",
  balance: "orders.short.balance",
  caution_amount: "orders.short.caution",
};

/**
 * Nombre de colonnes que le tableau affiche selon la largeur : 4 sur
 * téléphone (< 640 px), 6 sur tablette (< 1024 px), toutes au-delà.
 * Mesuré sur la zone de contenu (`max-w-5xl`) : en deçà de ~90 px par
 * colonne, un montant ou une date ne tient plus sur une ligne.
 */
export const TABLE_LIMITS = { phone: 4, tablet: 6 } as const;

function sanitizeColumns(value: unknown): OrderColumn[] | null {
  if (!Array.isArray(value)) return null;
  const kept = ORDER_COLUMNS.filter((c) => value.includes(c));
  if (!kept.includes(LOCKED_COLUMN)) kept.unshift(LOCKED_COLUMN);
  return kept.length ? kept : null;
}

const columnsSetting = createDeviceSetting<OrderColumn[]>({
  key: "daydream.orders.columns",
  fallback: DEFAULT_COLUMNS,
  sanitize: sanitizeColumns,
});

export function useOrderColumns() {
  const columns = columnsSetting.useValue();

  const toggle = useCallback((column: OrderColumn) => {
    if (column === LOCKED_COLUMN) return;
    const prev = columnsSetting.get();
    columnsSetting.set(
      prev.includes(column)
        ? prev.filter((c) => c !== column)
        : ORDER_COLUMNS.filter((c) => c === column || prev.includes(c)),
    );
  }, []);

  return { columns, toggle };
}

/* --------------------------------------------------------------------------
 * Affichage Liste / Tableau, lui aussi par appareil.
 *
 * `null` = jamais choisi : on suit alors la largeur (tableau dès 768 px,
 * liste en dessous), comme avant l'existence du bouton.
 * ------------------------------------------------------------------------ */

const viewSetting = createDeviceSetting<ListView | null>({
  key: "daydream.orders.view",
  fallback: null,
  sanitize: (value) => (value === "list" || value === "table" ? value : null),
});

/**
 * L'affichage effectif, ou `null` tant qu'il est inconnu (rendu serveur,
 * hydratation) : l'écran retombe alors sur la bascule CSS par largeur.
 */
export function useOrdersView() {
  const stored = viewSetting.useValue();
  const wide = useMediaQuery("(min-width: 48rem)");
  const view: ListView | null =
    wide === null ? null : (stored ?? (wide ? "table" : "list"));
  return { view, setView: viewSetting.set };
}

export function OrderColumnsDrawer({
  columns,
  onToggle,
  view,
}: {
  columns: OrderColumn[];
  onToggle: (column: OrderColumn) => void;
  view: ListView | null;
}) {
  const t = useTranslations();
  const phone = useMediaQuery("(max-width: 39.99rem)");
  // Sur téléphone en mode Tableau, on signale les colonnes cochées qui ne
  // tiennent pas : sinon on en coche une et rien ne change à l'écran.
  const flagHidden = view === "table" && phone === true;
  const checkedOrder = ORDER_COLUMNS.filter((c) => columns.includes(c));

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
            const hidden =
              flagHidden && checked && checkedOrder.indexOf(column) >= TABLE_LIMITS.phone;
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
                  {hidden && (
                    <Badge variant="outline" className="text-muted-foreground">
                      {t("orders.hiddenOnPhone")}
                    </Badge>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </DrawerContent>
    </Drawer>
  );
}
