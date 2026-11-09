import "server-only";
import type { getTranslations } from "next-intl/server";
import type { Row } from "write-excel-file/node";

/**
 * La feuille « Commandes » — partagée par l'export de la liste
 * (`/api/commandes/export`) et la sauvegarde mensuelle (`lib/backup`) :
 * mêmes colonnes, mêmes types de cellules.
 *
 * Téléphone en TEXTE (Excel effacerait le 0 initial), dates en vraies dates,
 * montants en nombres qu'on additionne. Une cellule texte n'est jamais évaluée
 * comme formule : pas d'injection « =… » par un nom de client.
 */

export type Translator = Awaited<ReturnType<typeof getTranslations>>;

export const ORDER_SELECT = `order_no, customer_name, customer_phone, event_date, pickup_date,
  return_due_date, status, total_price, amount_paid, balance,
  caution_amount, caution_returned, picked_up, returned,
  order_lines ( external_label, model_name_snapshot, article_units ( ref_code ) )`;

export type ExportOrder = {
  order_no: string;
  customer_name: string;
  customer_phone: string | null;
  event_date: string;
  pickup_date: string;
  return_due_date: string;
  status: string;
  total_price: number;
  amount_paid: number;
  balance: number | null;
  caution_amount: number;
  caution_returned: boolean;
  picked_up: boolean;
  returned: boolean;
  order_lines: {
    external_label: string | null;
    model_name_snapshot: string | null;
    article_units: { ref_code: string } | null;
  }[];
};

const STATUS_KEYS: Record<string, string> = {
  reservee: "reserved",
  en_cours: "inProgress",
  retournee: "returned",
  annulee: "cancelled",
};

/* --- Cellules ------------------------------------------------------------ */

export const bold = (value: string) => ({ value, fontWeight: "bold" as const });

export const text = (value: string | null | undefined) =>
  value ? { value, type: String } : null;

export const money = (value: number | null | undefined) => ({
  value: value ?? 0,
  type: Number,
  format: "#,##0",
});

/** Minuit UTC : la date d'une commande est un JOUR, sans heure ni fuseau. */
export const day = (iso: string | null | undefined) =>
  iso ? { value: new Date(`${iso.slice(0, 10)}T00:00:00Z`), type: Date, format: "dd/mm/yyyy" } : null;

/** Booléen natif : Excel l'affiche dans la langue du tableur (VRAI / FAUX). */
export const flag = (value: boolean) => ({ value, type: Boolean });

/* --- La feuille ---------------------------------------------------------- */

export function orderHeader(t: Translator): Row {
  return [
    bold(t("orders.orderNo")),
    bold(t("orders.customer")),
    bold(t("orders.phone")),
    bold(t("orders.event")),
    bold(t("orders.pickupDate")),
    bold(t("orders.returnDate")),
    bold(t("orders.statusLabel")),
    bold(t("orders.pieces")),
    bold(t("orders.total")),
    bold(t("orders.paid")),
    bold(t("orders.balance")),
    bold(t("orders.caution")),
    bold(t("orders.cautionReturned")),
    bold(t("orders.pickedUp")),
    bold(t("orders.returned")),
  ];
}

export function orderRow(o: ExportOrder, t: Translator): Row {
  return [
    { value: o.order_no, type: String },
    { value: o.customer_name, type: String },
    text(o.customer_phone),
    day(o.event_date),
    day(o.pickup_date),
    day(o.return_due_date),
    { value: t(`orders.status.${STATUS_KEYS[o.status] ?? "reserved"}`), type: String },
    {
      value: o.order_lines
        // La référence du stock en premier : c'est elle qu'on retrouve sur le
        // cintre. À défaut, le nom retenu à la commande — une pièce externe ou
        // un vêtement repris du tableur n'a pas de référence.
        .map((l) => l.article_units?.ref_code ?? l.external_label ?? l.model_name_snapshot ?? "")
        .filter(Boolean)
        .join(", "),
      type: String,
    },
    money(o.total_price),
    money(o.amount_paid),
    money(o.balance),
    money(o.caution_amount),
    flag(o.caution_returned),
    flag(o.picked_up),
    flag(o.returned),
  ];
}

export const ORDER_COLUMNS = [
  { width: 12 },
  { width: 26 },
  { width: 14 },
  { width: 12 },
  { width: 12 },
  { width: 12 },
  { width: 12 },
  { width: 36 },
  { width: 12 },
  { width: 12 },
  { width: 12 },
  { width: 12 },
  { width: 10 },
  { width: 10 },
  { width: 10 },
];
