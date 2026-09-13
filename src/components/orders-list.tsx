"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, CalendarPlus, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import {
  OrderColumnsDrawer,
  useOrderColumns,
  type OrderColumn,
  COLUMN_LABEL_KEYS,
  ORDER_COLUMNS,
} from "@/components/orders-columns";
import { PAGE_SIZE, SORTABLE, type OrderRow, type SortKey } from "@/lib/orders-query";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { daysBetween, todayIso } from "@/lib/rental-range";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/routing";

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

/** Colonnes monétaires : alignées à la fin, en chiffres tabulaires. */
const MONEY: OrderColumn[] = ["total_price", "amount_paid", "balance", "caution_amount"];

export function OrdersList({
  orders,
  total,
  page,
  sort,
  ascending,
}: {
  orders: OrderRow[];
  total: number;
  page: number;
  sort: SortKey;
  ascending: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { locale } = useParams<{ locale: Locale }>();
  const { columns, toggle } = useOrderColumns();

  const hasFilters = Boolean(params.get("q") || params.get("statut"));

  if (!orders.length) {
    return (
      <div className="border-border mt-6 flex flex-col items-center rounded-lg border border-dashed px-6 py-16 text-center">
        <CalendarPlus className="text-muted-foreground size-8" aria-hidden />
        <p className="text-muted-foreground mt-4 text-sm">
          {hasFilters ? t("orders.noMatch") : t("common.empty")}
        </p>
        {!hasFilters && (
          <Button asChild className="mt-6">
            <Link href="/commandes/nouvelle">
              <Plus className="size-4" aria-hidden />
              {t("orders.new")}
            </Link>
          </Button>
        )}
      </div>
    );
  }

  const shown = ORDER_COLUMNS.filter((c) => columns.includes(c));
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const first = (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, total);

  function href(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  /**
   * Un reste NÉGATIF n'est pas une dette : le client a versé plus que le prix
   * final (acompte encaissé avant une remise, par exemple). L'afficher comme
   * un « Reste » en rouge inquiéterait pour rien — c'est un montant à RENDRE.
   */
  function balanceLabel(order: OrderRow) {
    const b = order.balance ?? 0;
    return b < 0 ? t("orders.toRefund") : t("orders.balance");
  }

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
      case "status": {
        // Le retard REMPLACE le statut : « En cours » ne dit rien de plus que
        // « En retard de 3 j », et deux pastilles ne tiennent pas dans une
        // cellule de liste. Il ne se stocke nulle part — c'est le calendrier
        // qui le dit, à chaque affichage.
        const late = order.status === "en_cours"
          && daysBetween(todayIso(), order.return_due_date) < 0;

        return (
          <Badge
            className={
              late
                ? "bg-warning-soft text-warning-foreground border-transparent"
                : STATUS_STYLES[order.status]
            }
          >
            {late
              ? t("orders.lateBy", {
                  count: formatNumber(-daysBetween(todayIso(), order.return_due_date), locale),
                })
              : t(`orders.status.${STATUS_KEYS[order.status]}`)}
          </Badge>
        );
      }
      case "total_price":
        return formatMoney(order.total_price, locale);
      case "amount_paid":
        return formatMoney(order.amount_paid, locale);
      case "balance":
        return formatMoney(Math.abs(order.balance ?? 0), locale);
      case "caution_amount":
        return formatMoney(order.caution_amount, locale);
    }
  }

  function toneFor(order: OrderRow, column: OrderColumn) {
    if (column !== "balance") return undefined;
    const b = order.balance ?? 0;
    if (b > 0) return "text-warning-foreground font-medium";
    if (b < 0) return "text-muted-foreground";
    return undefined;
  }

  return (
    <>
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {t("orders.range", {
            first: formatNumber(first, locale),
            last: formatNumber(last, locale),
            total: formatNumber(total, locale),
          })}
        </p>
        <OrderColumnsDrawer columns={columns} onToggle={toggle} />
      </div>

      {/* Téléphone : une carte par commande. Les colonnes choisies deviennent
          les lignes de la carte — un <table> ne passe pas à 390 px. */}
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
                        {column === "balance"
                          ? balanceLabel(order)
                          : t(COLUMN_LABEL_KEYS[column])}
                      </dt>
                      <dd
                        className={cn(
                          "min-w-0 truncate text-end",
                          MONEY.includes(column) && "tabular",
                          toneFor(order, column),
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

      {/* Écran large : le tableau. */}
      <div className="border-border mt-4 hidden overflow-x-auto rounded-lg border md:block">
        <table className="w-full text-sm">
          <thead>
            {/* En-tête collant : sur 25 lignes, on perd sinon le nom des
                colonnes dès qu'on défile. */}
            <tr className="bg-muted/60 sticky top-0 z-10">
              {shown.map((column) => {
                const sortable = column in SORTABLE;
                const active = sortable && sort === column;
                const money = MONEY.includes(column);

                return (
                  <th
                    key={column}
                    scope="col"
                    aria-sort={
                      active ? (ascending ? "ascending" : "descending") : undefined
                    }
                    className={cn(
                      "text-muted-foreground px-3 py-2.5 font-medium whitespace-nowrap",
                      money ? "text-end" : "text-start",
                    )}
                  >
                    {sortable ? (
                      <Link
                        href={href({
                          tri: column,
                          sens: active && !ascending ? "asc" : "desc",
                          page: null,
                        })}
                        className={cn(
                          "hover:text-foreground inline-flex items-center gap-1",
                          money && "flex-row-reverse",
                          active && "text-foreground",
                        )}
                      >
                        {t(COLUMN_LABEL_KEYS[column])}
                        {active ? (
                          ascending ? (
                            <ArrowUp className="size-3.5 shrink-0" aria-hidden />
                          ) : (
                            <ArrowDown className="size-3.5 shrink-0" aria-hidden />
                          )
                        ) : (
                          <span className="size-3.5 shrink-0" aria-hidden />
                        )}
                      </Link>
                    ) : (
                      t(COLUMN_LABEL_KEYS[column])
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {orders.map((order) => (
              /* LIGNE ENTIÈRE CLIQUABLE. Le <Link> réel reste dans la première
                 cellule — c'est lui qui porte le nom accessible et le focus
                 clavier. Le clic sur la ligne ne fait que le relayer à la
                 souris, en ignorant les clics sur un autre élément interactif.
                 Pas de <tr role="link"> : ce serait mentir sur la sémantique. */
              <tr
                key={order.id}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("a,button")) return;
                  router.push(`/commandes/${order.id}`, { locale });
                }}
                className="border-border hover:bg-accent/60 cursor-pointer border-t transition-colors"
              >
                {shown.map((column, i) => (
                  <td
                    key={column}
                    className={cn(
                      "px-3 py-3",
                      MONEY.includes(column) ? "tabular text-end" : "text-start",
                      toneFor(order, column),
                    )}
                  >
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

      {lastPage > 1 && (
        <nav
          className="mt-6 flex items-center justify-between gap-3"
          aria-label={t("orders.pagination")}
        >
          <Button
            asChild={page > 1}
            variant="outline"
            disabled={page <= 1}
            className="h-11"
          >
            {page > 1 ? (
              <Link href={href({ page: String(page - 1) })}>
                <ChevronLeft className="size-4 rtl:-scale-x-100" aria-hidden />
                {t("orders.previous")}
              </Link>
            ) : (
              <span>
                <ChevronLeft className="size-4 rtl:-scale-x-100" aria-hidden />
                {t("orders.previous")}
              </span>
            )}
          </Button>

          <span className="text-muted-foreground tabular text-sm">
            {t("orders.pageOf", {
              page: formatNumber(page, locale),
              total: formatNumber(lastPage, locale),
            })}
          </span>

          <Button
            asChild={page < lastPage}
            variant="outline"
            disabled={page >= lastPage}
            className="h-11"
          >
            {page < lastPage ? (
              <Link href={href({ page: String(page + 1) })}>
                {t("orders.next")}
                <ChevronRight className="size-4 rtl:-scale-x-100" aria-hidden />
              </Link>
            ) : (
              <span>
                {t("orders.next")}
                <ChevronRight className="size-4 rtl:-scale-x-100" aria-hidden />
              </span>
            )}
          </Button>
        </nav>
      )}
    </>
  );
}
