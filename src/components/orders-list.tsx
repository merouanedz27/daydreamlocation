"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, CalendarPlus, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import {
  OrderColumnsDrawer,
  useOrderColumns,
  useOrdersView,
  type OrderColumn,
  COLUMN_LABEL_KEYS,
  COLUMN_SHORT_KEYS,
  ORDER_COLUMNS,
  TABLE_LIMITS,
} from "@/components/orders-columns";
import { ViewToggle } from "@/components/view-toggle";
import { PaginationBar } from "@/components/pagination-bar";
import { sheet } from "@/components/sheet-table";
import { SORTABLE, type OrderRow, type SortKey } from "@/lib/orders-query";
import { CURRENCY_SUFFIX, formatDate, formatMoney, formatNumber } from "@/lib/format";
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

/** Valeurs qui ne se coupent jamais dans le tableau. */
const ATOMIC: OrderColumn[] = [...MONEY, "event_date", "pickup_date"];

/**
 * Une colonne du tableau se masque selon sa POSITION parmi les colonnes
 * cochées : 4 sur téléphone, 6 sur tablette, toutes au-delà. Même classe sur
 * le `th` et les `td`, sinon l'en-tête se décale.
 */
function visibility(index: number) {
  if (index >= TABLE_LIMITS.tablet) return "hidden lg:table-cell";
  if (index >= TABLE_LIMITS.phone) return "hidden sm:table-cell";
  return undefined;
}

export function OrdersList({
  orders,
  total,
  page,
  perPage,
  sort,
  ascending,
}: {
  orders: OrderRow[];
  total: number;
  page: number;
  perPage: number;
  sort: SortKey;
  ascending: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { locale } = useParams<{ locale: Locale }>();
  const { columns, toggle } = useOrderColumns();
  const { view, setView } = useOrdersView();

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
  const first = (page - 1) * perPage + 1;
  const last = Math.min(page * perPage, total);

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

  /** Montant d'une colonne monétaire, sans unité. */
  function amount(order: OrderRow, column: OrderColumn): number {
    switch (column) {
      case "total_price":
        return order.total_price;
      case "amount_paid":
        return order.amount_paid;
      case "balance":
        return Math.abs(order.balance ?? 0);
      default:
        return order.caution_amount;
    }
  }

  function cell(order: OrderRow, column: OrderColumn) {
    switch (column) {
      case "order_no": {
        // Point de coupure après « CMD- » : sur téléphone, « CMD- / 00120 » sur
        // deux lignes plutôt qu'un tableau qui déborde. Sans <wbr>, la règle
        // Unicode interdit de couper entre un tiret et un chiffre.
        const [head, ...tail] = order.order_no.split("-");
        return (
          <bdi>
            {tail.length ? <>{`${head}-`}<wbr className="md:hidden" />{tail.join("-")}</> : head}
          </bdi>
        );
      }
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
            className={cn(
              "h-auto whitespace-normal",
              late
                ? "bg-warning-soft text-warning-foreground border-transparent"
                : STATUS_STYLES[order.status],
            )}
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
      case "amount_paid":
      case "balance":
      case "caution_amount":
        return formatMoney(amount(order, column), locale);
    }
  }

  function toneFor(order: OrderRow, column: OrderColumn) {
    if (column !== "balance") return undefined;
    const b = order.balance ?? 0;
    if (b > 0) return "text-warning-foreground font-medium";
    if (b < 0) return "text-muted-foreground";
    return undefined;
  }

  /* ------------------------------------------------------------------------
   * Liste : une carte par commande. Les colonnes choisies deviennent les
   * lignes de la carte.
   * ---------------------------------------------------------------------- */
  const cards = (className?: string) => (
    <ul className={cn("mt-4 grid gap-3", className)}>
      {orders.map((order) => (
        <li key={order.id}>
          <Link
            href={`/commandes/${order.id}`}
            className="border-border bg-card hover:border-gold-strong block h-full rounded-lg border p-4 transition-colors"
          >
            <p className="truncate font-medium">{order.customer_name}</p>

            <dl className="mt-2 flex flex-col gap-1 text-sm">
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
  );

  /* ------------------------------------------------------------------------
   * Tableau, façon tableur — et SANS défilement horizontal, à toute largeur :
   *  - il ne prend jamais plus que la largeur disponible (`w-full`) et une
   *    cellule trop étroite passe à la ligne au lieu de pousser le tableau ;
   *  - sur écran étroit, seules les premières colonnes cochées s'affichent
   *    (`visibility`) ;
   *  - l'unité monétaire monte dans l'en-tête : chaque montant y gagne la
   *    largeur de « DA ».
   * Allure commune au stock : voir `sheet-table.ts`.
   * ---------------------------------------------------------------------- */
  const table = (className?: string) => (
    <div className={cn(sheet.wrapper, className)}>
      {/* 13 px et marges serrées sur téléphone : quatre valeurs insécables
          (n°, téléphone, deux dates) doivent tenir côte à côte sur 358 px. */}
      <table className={sheet.table}>
        <thead>
          <tr className={sheet.headRow}>
            {shown.map((column, i) => {
              const sortable = column in SORTABLE;
              const active = sortable && sort === column;
              const money = MONEY.includes(column);
              const label = money
                ? t("orders.withCurrency", {
                    label: t(COLUMN_SHORT_KEYS[column]),
                    currency: CURRENCY_SUFFIX[locale],
                  })
                : t(COLUMN_SHORT_KEYS[column]);

              return (
                <th
                  key={column}
                  scope="col"
                  title={t(COLUMN_LABEL_KEYS[column])}
                  aria-sort={
                    active ? (ascending ? "ascending" : "descending") : undefined
                  }
                  className={cn(
                    sheet.th,
                    money ? "text-end" : "text-start",
                    visibility(i),
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
                        sheet.thInner,
                        "hover:text-foreground",
                        money && "justify-end",
                        active && "text-foreground",
                      )}
                    >
                      <span>{label}</span>
                      {active ? (
                        ascending ? (
                          <ArrowUp className="size-3.5 shrink-0" aria-hidden />
                        ) : (
                          <ArrowDown className="size-3.5 shrink-0" aria-hidden />
                        )
                      ) : null}
                    </Link>
                  ) : (
                    <span className={sheet.thInner}>
                      {label}
                    </span>
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
              className={sheet.row}
            >
              {shown.map((column, i) => {
                const money = MONEY.includes(column);
                const content = money ? (
                  formatNumber(amount(order, column), locale)
                ) : column === "customer_name" ? (
                  // Largeur plancher : sans elle, le navigateur rogne d'abord
                  // cette colonne et coupe « Mohamed » en « Moham / ed ».
                  <span className="block min-w-14 wrap-anywhere">{order.customer_name}</span>
                ) : (
                  cell(order, column)
                );

                return (
                  <td
                    key={column}
                    className={cn(
                      sheet.td,
                      money ? "tabular text-end" : "text-start",
                      // Une date ou un montant coupé en deux (« 10/09/202 6 ») ne se
                      // relit plus : ces valeurs restent entières. Le reste passe à
                      // la ligne à un endroit lisible (espace, tiret).
                      ATOMIC.includes(column) && "whitespace-nowrap",
                      // Dès 768 px la place suffit : n° et téléphone sur une ligne.
                      (column === "order_no" || column === "customer_phone") &&
                        "md:whitespace-nowrap",
                      toneFor(order, column),
                      visibility(i),
                    )}
                    title={column === "balance" ? balanceLabel(order) : undefined}
                  >
                    {i === 0 ? (
                      <Link
                        href={`/commandes/${order.id}`}
                        className={sheet.rowLink}
                      >
                        {content}
                      </Link>
                    ) : (
                      content
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <p className="text-muted-foreground text-sm">
          {t("orders.range", {
            first: formatNumber(first, locale),
            last: formatNumber(last, locale),
            total: formatNumber(total, locale),
          })}
        </p>
        <div className="ms-auto flex items-center gap-2">
          <ViewToggle view={view} onChange={setView} />
          <OrderColumnsDrawer columns={columns} onToggle={toggle} view={view} />
        </div>
      </div>

      {/* Tant que l'affichage est inconnu (rendu serveur, hydratation), on
          garde la bascule par largeur : pas de saut visible sur ordinateur. */}
      {view === null && (
        <>
          {cards("md:hidden")}
          {table("hidden md:block")}
        </>
      )}
      {view === "list" && cards("md:grid-cols-2 lg:grid-cols-3")}
      {view === "table" && table()}

      <PaginationBar page={page} perPage={perPage} total={total} />
    </>
  );
}
