import "server-only";
import { getTranslations } from "next-intl/server";
import writeXlsxFile, { type Row, type Sheet } from "write-excel-file/node";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  bold,
  day,
  flag,
  money,
  ORDER_COLUMNS,
  ORDER_SELECT,
  orderHeader,
  orderRow,
  text,
  type ExportOrder,
  type Translator,
} from "@/lib/export/orders-sheet";
import type { Locale } from "@/i18n/routing";

/**
 * La SAUVEGARDE MENSUELLE — tout l'historique dans un seul `.xlsx`, envoyé
 * aux administrateurs par e-mail (`sendMonthlyBackup`). Si la base disparaît,
 * le dernier e-mail suffit à tout relire : commandes, pièces de chaque
 * commande, stock et dépenses.
 *
 * Un filet de sécurité LISIBLE, pas une sauvegarde technique : il ne se
 * recharge pas tel quel dans l'application, et les photos n'y sont pas.
 *
 * Lu par le client ADMIN : la tâche planifiée n'a pas de session. LECTURE
 * SEULE, et le fichier ne part qu'aux administrateurs.
 */

/** PostgREST plafonne SANS PRÉVENIR à 1 000 lignes : on lit par tranches. */
const CHUNK = 1000;

type Page<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

/** Lit TOUT, tranche par tranche. La requête doit avoir un ordre stable (par `id`). */
async function readAll<T>(page: (from: number, to: number) => Page<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += CHUNK) {
    const { data, error } = await page(from, from + CHUNK - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < CHUNK) return rows;
  }
}

type BackupOrder = ExportOrder & { notes: string | null; created_at: string };

type BackupLine = {
  unit_price: number;
  model_name_snapshot: string | null;
  size_snapshot: string | null;
  external_source: string | null;
  external_label: string | null;
  external_cost: number | null;
  line_kind: string;
  is_active: boolean;
  orders: { order_no: string } | null;
  article_units: { ref_code: string } | null;
};

type BackupModel = {
  ref_code: string;
  name_fr: string;
  name_ar: string | null;
  purpose: string;
  color: string | null;
  brand: string | null;
  base_price: number;
  purchase_price: number;
  is_active: boolean;
  categories: { name_fr: string; name_ar: string } | null;
};

type BackupUnit = {
  ref_code: string;
  size: string | null;
  part: string | null;
  status: string;
  condition: string;
  price_override: number | null;
  purchase_price: number | null;
  purchase_date: string | null;
  notes: string | null;
  article_models: { ref_code: string } | null;
};

type BackupEnsemble = {
  name: string;
  package_price: number | null;
  is_active: boolean;
  ensemble_items: { article_units: { ref_code: string } | null }[];
};

type BackupExpense = {
  spent_on: string;
  category: string;
  amount: number;
  description: string | null;
  orders: { order_no: string } | null;
  profiles: { full_name: string } | null;
};

export type BackupData = {
  orders: BackupOrder[];
  lines: BackupLine[];
  models: BackupModel[];
  units: BackupUnit[];
  ensembles: BackupEnsemble[];
  expenses: BackupExpense[];
};

export type BackupCounts = { [K in keyof BackupData]: number };

/** Les données, lues UNE fois : chaque langue en fait ensuite son fichier. */
export async function readBackupData(): Promise<BackupData> {
  const admin = createAdminClient();
  const [orders, lines, models, units, ensembles, expenses] = await Promise.all([
    readAll<BackupOrder>((from, to) =>
      admin
        .from("orders")
        .select(`${ORDER_SELECT}, notes, created_at`)
        .order("event_date", { ascending: false })
        .order("id", { ascending: false })
        .order("id", { referencedTable: "order_lines", ascending: true })
        .range(from, to)
        .overrideTypes<BackupOrder[], { merge: false }>(),
    ),
    readAll<BackupLine>((from, to) =>
      admin
        .from("order_lines")
        .select(
          `unit_price, model_name_snapshot, size_snapshot, external_source, external_label,
           external_cost, line_kind, is_active, orders ( order_no ), article_units ( ref_code )`,
        )
        .order("order_id", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to)
        .overrideTypes<BackupLine[], { merge: false }>(),
    ),
    readAll<BackupModel>((from, to) =>
      admin
        .from("article_models")
        .select(
          `ref_code, name_fr, name_ar, purpose, color, brand, base_price, purchase_price,
           is_active, categories ( name_fr, name_ar )`,
        )
        .order("ref_code")
        .order("id")
        .range(from, to)
        .overrideTypes<BackupModel[], { merge: false }>(),
    ),
    readAll<BackupUnit>((from, to) =>
      admin
        .from("article_units")
        .select(
          `ref_code, size, part, status, condition, price_override, purchase_price,
           purchase_date, notes, article_models ( ref_code )`,
        )
        .order("ref_code")
        .order("id")
        .range(from, to)
        .overrideTypes<BackupUnit[], { merge: false }>(),
    ),
    readAll<BackupEnsemble>((from, to) =>
      admin
        .from("ensembles")
        .select("name, package_price, is_active, ensemble_items ( article_units ( ref_code ) )")
        .order("name")
        .order("id")
        .range(from, to)
        .overrideTypes<BackupEnsemble[], { merge: false }>(),
    ),
    readAll<BackupExpense>((from, to) =>
      admin
        .from("expenses")
        .select(
          "spent_on, category, amount, description, orders ( order_no ), profiles ( full_name )",
        )
        .order("spent_on", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to)
        .overrideTypes<BackupExpense[], { merge: false }>(),
    ),
  ]);
  return { orders, lines, models, units, ensembles, expenses };
}

export function backupCounts(data: BackupData): BackupCounts {
  return {
    orders: data.orders.length,
    lines: data.lines.length,
    models: data.models.length,
    units: data.units.length,
    ensembles: data.ensembles.length,
    expenses: data.expenses.length,
  };
}

/** Le statut d'une pièce, tel que l'écran du stock le nomme. */
const UNIT_STATUS_KEYS: Record<string, string> = {
  disponible: "stock.available",
  nettoyage: "stock.cleaning",
  reparation: "stock.repair",
  retire: "stock.retired",
};

/** Excel refuse ces caractères dans un nom de feuille, et plus de 31 caractères. */
function sheetName(name: string): string {
  return name.replace(/[[\]:*?/\\]/g, " ").slice(0, 31);
}

/** Le classeur, dans la langue de son destinataire. */
export async function buildBackupWorkbook(data: BackupData, locale: Locale): Promise<Buffer> {
  const t: Translator = await getTranslations({ locale });
  /** Un code connu se traduit ; un code inattendu reste lisible tel quel. */
  const label = (key: string, raw: string | null | undefined) =>
    raw ? { value: t.has(key) ? t(key) : raw, type: String } : null;
  const ar = locale === "ar";
  const sheet = (name: string, rows: Row[], columns: number[]): Sheet<Buffer> => ({
    sheet: sheetName(name),
    data: rows,
    rightToLeft: ar,
    stickyRowsCount: 1,
    columns: columns.map((width) => ({ width })),
  });

  const orders = sheet(
    t("backup.sheets.orders"),
    [
      [...orderHeader(t), bold(t("backup.columns.notes")), bold(t("backup.columns.createdAt"))],
      ...data.orders.map((o) => [...orderRow(o, t), text(o.notes), day(o.created_at)]),
    ],
    [...ORDER_COLUMNS.map((c) => c.width), 30, 12],
  );

  const lines = sheet(
    t("backup.sheets.lines"),
    [
      [
        bold(t("orders.orderNo")),
        bold(t("stock.reference")),
        bold(t("stock.model")),
        bold(t("stock.size")),
        bold(t("orders.linePrice")),
        bold(t("stock.usage.label")),
        bold(t("orders.externalSource")),
        bold(t("orders.externalCost")),
        bold(t("backup.columns.active")),
      ],
      ...data.lines.map((l) => [
        text(l.orders?.order_no),
        text(l.article_units?.ref_code ?? l.external_label),
        text(l.model_name_snapshot),
        text(l.size_snapshot),
        money(l.unit_price),
        label(`stock.usage.${l.line_kind}`, l.line_kind),
        text(l.external_source),
        l.external_cost == null ? null : money(l.external_cost),
        flag(l.is_active),
      ]),
    ],
    [12, 16, 26, 8, 12, 12, 18, 12, 8],
  );

  const models = sheet(
    t("backup.sheets.models"),
    [
      [
        bold(t("stock.reference")),
        bold(t("stock.nameFr")),
        bold(t("stock.nameAr")),
        bold(t("stock.category")),
        bold(t("stock.usage.label")),
        bold(t("stock.color")),
        bold(t("stock.brand")),
        bold(t("stock.price")),
        bold(t("stock.purchasePrice")),
        bold(t("backup.columns.active")),
      ],
      ...data.models.map((m) => [
        { value: m.ref_code, type: String },
        { value: m.name_fr, type: String },
        text(m.name_ar),
        text(ar ? m.categories?.name_ar : m.categories?.name_fr),
        label(`stock.usage.${m.purpose}`, m.purpose),
        text(m.color),
        text(m.brand),
        money(m.base_price),
        money(m.purchase_price),
        flag(m.is_active),
      ]),
    ],
    [14, 24, 24, 14, 12, 12, 14, 12, 12, 8],
  );

  const units = sheet(
    t("backup.sheets.units"),
    [
      [
        bold(t("stock.reference")),
        bold(t("stock.model")),
        bold(t("stock.size")),
        bold(t("backup.columns.part")),
        bold(t("backup.columns.status")),
        bold(t("stock.condition")),
        bold(t("stock.priceOverride")),
        bold(t("stock.purchasePrice")),
        bold(t("backup.columns.purchaseDate")),
        bold(t("backup.columns.notes")),
      ],
      ...data.units.map((u) => [
        { value: u.ref_code, type: String },
        text(u.article_models?.ref_code),
        text(u.size),
        label(`stock.parts.${u.part}`, u.part),
        label(UNIT_STATUS_KEYS[u.status] ?? "", u.status),
        label(`stock.conditions.${u.condition}`, u.condition),
        u.price_override == null ? null : money(u.price_override),
        u.purchase_price == null ? null : money(u.purchase_price),
        day(u.purchase_date),
        text(u.notes),
      ]),
    ],
    [16, 14, 8, 12, 14, 10, 12, 12, 12, 30],
  );

  const ensembles = sheet(
    t("backup.sheets.ensembles"),
    [
      [
        bold(t("stock.ensemble")),
        bold(t("stock.price")),
        bold(t("orders.pieces")),
        bold(t("backup.columns.active")),
      ],
      ...data.ensembles.map((e) => [
        { value: e.name, type: String },
        e.package_price == null ? null : money(e.package_price),
        text(
          e.ensemble_items
            .map((i) => i.article_units?.ref_code)
            .filter(Boolean)
            .join(", "),
        ),
        flag(e.is_active),
      ]),
    ],
    [24, 12, 40, 8],
  );

  const expenses = sheet(
    t("backup.sheets.expenses"),
    [
      [
        bold(t("expenses.date")),
        bold(t("expenses.category")),
        bold(t("expenses.amount")),
        bold(t("expenses.description")),
        bold(t("expenses.linkedOrder")),
        bold(t("backup.columns.createdBy")),
      ],
      ...data.expenses.map((x) => [
        day(x.spent_on),
        label(`expenses.categories.${x.category}`, x.category),
        money(x.amount),
        text(x.description),
        text(x.orders?.order_no),
        text(x.profiles?.full_name),
      ]),
    ],
    [12, 16, 12, 34, 12, 20],
  );

  return writeXlsxFile([orders, lines, models, units, ensembles, expenses]).toBuffer();
}
