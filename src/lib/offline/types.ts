/**
 * Hors ligne — les formes partagées par le serveur (`/api/offline/snapshot`)
 * et le téléphone (IndexedDB, file d'attente). Aucune valeur, aucune
 * dépendance : importable des deux côtés.
 */
import type { IsoDate } from "@/lib/rental-range";
import type { MarkKind } from "@/lib/pointage";
import type { QuickDraft } from "@/lib/quick-draft";
import type {
  CustomerSuggestion,
  ItemSuggestion,
  PickerModel,
  Settings,
} from "@/lib/queries/orders";

/** Une commande telle qu'on la relit sans réseau : de quoi servir un client au comptoir. */
export type OfflineOrder = {
  id: number;
  order_no: string;
  customer_name: string;
  customer_phone: string | null;
  pickup_date: IsoDate;
  event_date: IsoDate;
  return_due_date: IsoDate;
  status: string;
  picked_up: boolean;
  returned: boolean;
  total_price: number;
  amount_paid: number;
  balance: number;
  caution_amount: number;
  caution_returned: boolean;
  /** Pièces actives : « Tuxedo B · 50 · TUX-B-03 ». */
  lines: { label: string; size: string | null; ref: string | null }[];
  notes: string | null;
  /** Version en base (`orders.version`) : une modification hors ligne part de celle-ci. */
  version: number;
  /** Les lignes complètes, pour rouvrir la commande dans le formulaire sans réseau. */
  editLines: {
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

/** Une pièce du stock réservée : `range` est la plage Postgres, nettoyage compris. */
export type OfflineBooking = {
  unitId: number;
  orderId: number;
  orderNo: string | null;
  range: string;
};

/** Le formulaire de commande sans réseau : stock, clients, réglages, réservations. */
export type OfflineCatalog = {
  userId: string;
  syncedAt: string;
  models: PickerModel[];
  items: ItemSuggestion[];
  customers: CustomerSuggestion[];
  settings: Settings;
  /** [libellé normalisé, case habituelle] — pour replacer les pièces d'une commande. */
  labelSlots: [string, number][];
  bookings: OfflineBooking[];
};

/** Les champs du formulaire de commande, tels que les lit `createOrder` / `updateOrder`. */
export type OrderFields = Record<string, string>;

/** Le dernier état connu, gardé sur le téléphone. */
export type OfflineSnapshot = {
  /** À qui appartient ce cliché : un autre compte sur le même téléphone ne le relit pas. */
  userId: string;
  /** ISO — « données du 21/10 à 14:32 ». */
  syncedAt: string;
  /** Jour d'Alger au moment du cliché. */
  today: IsoDate;
  orders: OfflineOrder[];
};

/**
 * Un geste mis en attente. Seuls des gestes SANS risque de double location :
 * cocher ✈ / ✓, encaisser, noter un frais, pointer. Une commande ne se crée
 * jamais hors ligne — la disponibilité se décide en base.
 */
export type OutboxOp =
  | { kind: "check"; orderId: number; field: "picked_up" | "returned"; value: boolean }
  | {
      kind: "payment";
      orderId: number;
      amount: number;
      direction: "payment" | "refund";
      /** Rend le renvoi sans effet en base (`client_op_id`). */
      opId: string;
    }
  | {
      kind: "expense";
      spent_on: IsoDate;
      category: string;
      amount: number;
      description: string;
      order_id: number | null;
      opId: string;
    }
  | { kind: "mark"; markKind: MarkKind; day: IsoDate; on: boolean; /** Absent : soi-même. */ userId: string | null }
  | {
      /** Commande PROVISOIRE : confirmée ou refusée par la base au retour du réseau. */
      kind: "order";
      opId: string;
      fields: OrderFields;
      /** La saisie telle quelle : « Corriger » la remet dans le formulaire. */
      draft: QuickDraft;
      /** Pour l'afficher et griser ses pièces en attendant. */
      summary: { customerName: string; eventDate: IsoDate; pickup: IsoDate; returnDue: IsoDate; unitIds: number[] };
    }
  | {
      /** Modification faite hors ligne, à partir d'une version connue. */
      kind: "orderEdit";
      orderId: number;
      orderNo: string;
      expectedVersion: number;
      fields: OrderFields;
      draft: QuickDraft;
      summary: { customerName: string; eventDate: IsoDate; pickup: IsoDate; returnDue: IsoDate; unitIds: number[] };
    };

export type OutboxItem = {
  id: string;
  /** Le compte qui a fait le geste : jamais envoyé sous un autre. */
  userId: string;
  createdAt: string;
  /** Déjà traduit au moment du geste : « ✈ Aller validé — Benali ». */
  title: string;
  op: OutboxOp;
  status: "pending" | "rejected";
  /** Clé i18n de l'erreur, si la base a refusé. */
  error?: string;
  /** Valeurs de la clé : « {ref} déjà louée ». */
  errorValues?: Record<string, string>;
};
