"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { CalendarPlus, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import {
  OrderColumnsDrawer,
  useOrderColumns,
  type OrderColumn,
  COLUMN_LABEL_KEYS,
  ORDER_COLUMNS,
} from "@/components/orders-columns";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/routing";

export type OrderRow = {
  id: number;
  order_no: string;
  customer_name: string;
  customer_phone: string | null;
  event_date: string;
  pickup_date: string;
  status: string;
  total_price: number;
  amount_paid: number;
  balance: number | null;
  caution_amount: number;
};

const STATUS_STYLES: Record<string, string> = {
  reservee: "bg-gold-soft text-foreground border-transparent",
  en_cours: "bg-gold-soft text-foreground border-transparent",
  retournee: "bg-success-soft text-success-foreground border-transparent",
  annulee: "bg-muted text-muted-foreground border-transparent",
};

const STATUS_KEYS: Record<string, string> = {
  reservee: "reserved",
  en_cours: "inProgress",
  retournee: "returned",
  annulee: "cancelled",
};

/** Les colonnes monétaires s'alignent en chiffres tabulaires, à la fin. */
const MONEY: OrderColumn[] = ["total_price", "amount_paid", "balance", "caution_amount"];

export function OrdersList({ orders }: { orders: OrderRow[] }) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const { columns, toggle } = useOrderColumns();

  if (!orders.length) {
    return (
      <div className="border-border mt-8 flex flex-col items-center rounded-lg border border-dashed px-6 py-16 text-center">
        <CalendarPlus className="text-muted-foreground size-8" aria-hidden />
        <p className="text-muted-foreground mt-4 text-sm">{t("common.empty")}</p>
        <Button asChild className="mt-6">
          <Link href="/commandes/nouvelle">
            <Plus className="size-4" aria-hidden />
            {t("orders.new")}
          </Link>
        </Button>
      </div>
    );
  }

  const shown = ORDER_COLUMNS.filter((c) => columns.includes(c));

  function cell(order: OrderRow, column: OrderColumn) {
    switch (column) {
      case "order_no":
        return <bdi>{order.order_no}</bdi>;
      case "customer_name":
        return order.customer_name;
      case "customer_phone":
        return order.customer_phone ? <bdi dir="ltr">{order.customer_phone}</bdi> : "—";
      case "event_date":
        return formatDate(order.event_date, locale);
      case "pickup_date":
        return formatDate(order.pickup_date, locale);
      case "status":
        return (
          <Badge className={STATUS_STYLES[order.status]}>
            {t(`orders.status.${STATUS_KEYS[order.status]}`)}
          </Badge>
        );
      case "total_price":
        return formatMoney(order.total_price, locale);
      case "amount_paid":
        return formatMoney(order.amount_paid, locale);
      case "balance":
        return formatMoney(order.balance ?? 0, locale);
      case "caution_amount":
        return formatMoney(order.caution_amount, locale);
    }
  }

  return (
    <>
      <div className="mt-4 flex justify-end">
        <OrderColumnsDrawer columns={columns} onToggle={toggle} />
      </div>

      {/* Téléphone : une carte par commande. Les colonnes choisies deviennent
          les lignes de la carte. */}
      <ul className="mt-4 space-y-3 md:hidden">
        {orders.map((order) => (
          <li key={order.id}>
            <Link
              href={`/commandes/${order.id}`}
              className="border-border bg-card hover:border-gold-strong block rounded-lg border p-4 transition-colors"
            >
              <p className="truncate font-medium">{order.customer_name}</p>

              <dl className="mt-2 space-y-1 text-sm">
                {shown
                  .filter((c) => c !== "customer_name")
                  .map((column) => (
                    <div key={column} className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">
                        {t(COLUMN_LABEL_KEYS[column])}
                      </dt>
                      <dd
                        className={cn(
                          "min-w-0 truncate text-end",
                          MONEY.includes(column) && "tabular",
                          column === "balance" &&
                            (order.balance ?? 0) > 0 &&
                            "text-warning-foreground font-medium",
                        )}
                      >
                        {cell(order, column)}
                      </dd>
                    </div>
                  ))}
              </dl>
            </Link>
          </li>
        ))}
      </ul>

      {/* Écran large : le tableau, qui n'a de sens qu'à partir de `md`. */}
      <div className="mt-4 hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-border border-b">
              {shown.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className={cn(
                    "text-muted-foreground px-3 py-2 font-medium",
                    MONEY.includes(column) ? "text-end" : "text-start",
                  )}
                >
                  {t(COLUMN_LABEL_KEYS[column])}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-border hover:bg-muted/50 border-b">
                {shown.map((column, i) => (
                  <td
                    key={column}
                    className={cn(
                      "px-3 py-2",
                      MONEY.includes(column) ? "tabular text-end" : "text-start",
                      column === "balance" &&
                        (order.balance ?? 0) > 0 &&
                        "text-warning-foreground font-medium",
                    )}
                  >
                    {/* Un seul lien par ligne : répéter le lien sur chaque
                        cellule noierait la navigation au clavier. */}
                    {i === 0 ? (
                      <Link
                        href={`/commandes/${order.id}`}
                        className="hover:text-gold-strong underline-offset-4 hover:underline"
                      >
                        {cell(order, column)}
                      </Link>
                    ) : (
                      cell(order, column)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
