"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, CalendarPlus, Check, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { loadMoreOrders } from "@/lib/actions/orders-list";
import {
  DONE_NAME_CLASS,
  SORTABLE,
  isOrderDone,
  type OrderTableRow,
  type SortKey,
} from "@/lib/orders-query";
import { formatDate, formatNumber } from "@/lib/format";
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

/**
 * TOUTES les colonnes, dans l'ordre de son tableau AppSheet : qui, quand,
 * les deux cases, ce qu'il emporte, l'argent, puis le reste.
 */
const COLUMNS = [
  "customer_name",
  "customer_phone",
  "event_date",
  "picked_up",
  "returned",
  "pieces",
  "tailor",
  "amount_paid",
  "total_price",
  "balance",
  "caution_amount",
  "pickup_date",
  "return_due_date",
  "order_no",
  "status",
] as const;

type Column = (typeof COLUMNS)[number];

const HEADERS: Record<Column, string> = {
  customer_name: "orders.short.customer",
  customer_phone: "orders.short.phone",
  event_date: "orders.short.eventDate",
  picked_up: "orders.short.pickedUp",
  returned: "orders.short.returned",
  pieces: "orders.short.pieces",
  tailor: "orders.short.tailor",
  amount_paid: "orders.short.paid",
  total_price: "orders.short.total",
  balance: "orders.short.balance",
  caution_amount: "orders.short.caution",
  pickup_date: "orders.short.pickupDate",
  return_due_date: "orders.short.returnDue",
  order_no: "orders.short.orderNo",
  status: "orders.short.status",
};

const MONEY: Column[] = ["amount_paid", "total_price", "balance", "caution_amount"];

/** Rayure des lignes impaires, OPAQUE : la colonne collée doit cacher ce qui glisse dessous. */
const STRIPE = "bg-[color-mix(in_oklab,var(--muted)_45%,var(--background))]";

/**
 * Le tableau des commandes, COMME SON APPSHEET : toutes les colonnes, et on
 * fait défiler — vers la droite pour les colonnes, vers le bas pour les
 * commandes, qui arrivent d'elles-mêmes par tranches quand on approche du bas.
 * Plus de pages, plus de choix de colonnes, plus de bascule liste / tableau.
 *
 * Le tableau défile DANS son cadre (hauteur de l'écran) : c'est ce qui permet
 * de garder à la fois l'en-tête collé en haut et le nom du client collé au
 * bord pendant qu'on fait glisser les colonnes.
 *
 * Le parent remonte le composant à chaque changement de filtre (`key`) : la
 * liste repart de la première tranche.
 */
export function OrdersList({
  initialRows,
  total,
  sort,
  ascending,
}: {
  initialRows: OrderTableRow[];
  total: number;
  sort: SortKey;
  ascending: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { locale } = useParams<{ locale: Locale }>();

  const [rows, setRows] = useState(initialRows);
  const [loading, setLoading] = useState(false);
  /** Le serveur n'a plus rien rendu (commandes supprimées entre-temps). */
  const [exhausted, setExhausted] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const done = exhausted || rows.length >= total;

  // Une tranche de plus quand le bas du tableau approche (200 px d'avance :
  // la suite est déjà là quand le doigt y arrive).
  useEffect(() => {
    if (done || !sentinel.current) return;
    const filters = {
      q: params.get("q") ?? undefined,
      statut: params.get("statut") ?? undefined,
      tri: params.get("tri") ?? undefined,
      sens: params.get("sens") ?? undefined,
    };
    let busy = false;
    const observer = new IntersectionObserver(
      async (entries) => {
        if (busy || !entries[0]?.isIntersecting) return;
        busy = true;
        setLoading(true);
        const more = await loadMoreOrders(filters, rows.length);
        if (!more.length) setExhausted(true);
        // Pas de doublon si une commande a été créée entre deux tranches.
        setRows((current) => {
          const seen = new Set(current.map((r) => r.id));
          return [...current, ...more.filter((r) => !seen.has(r.id))];
        });
        setLoading(false);
      },
      { root: scroller.current, rootMargin: "0px 0px 200px 0px" },
    );
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [done, rows.length, params]);

  const hasFilters = Boolean(params.get("q") || params.get("statut"));

  if (!rows.length) {
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

  function sortHref(column: SortKey) {
    const next = new URLSearchParams(params.toString());
    const active = sort === column;
    next.set("tri", column);
    next.set("sens", active && !ascending ? "asc" : "desc");
    return `${pathname}?${next}`;
  }

  const today = todayIso();

  function cell(order: OrderTableRow, column: Column) {
    switch (column) {
      case "customer_name":
        return (
          <Link
            href={`/commandes/${order.id}`}
            className={cn(
              "hover:text-gold-strong font-medium underline-offset-4 hover:underline",
              isOrderDone(order) && DONE_NAME_CLASS,
            )}
          >
            {order.customer_name}
          </Link>
        );
      case "customer_phone":
        return order.customer_phone ? (
          <a href={`tel:${order.customer_phone}`} className="hover:underline" dir="ltr">
            {order.customer_phone}
          </a>
        ) : (
          "—"
        );
      case "event_date":
      case "pickup_date":
      case "return_due_date":
        return <span className="tabular">{formatDate(order[column], locale)}</span>;
      case "picked_up":
      case "returned":
        // ✗ / ✓ comme les deux colonnes de son AppSheet.
        return order[column] ? (
          <Check className="text-success-foreground mx-auto size-5" aria-label={t("common.yes")} />
        ) : (
          <X className="text-destructive/70 mx-auto size-4" aria-label={t("common.no")} />
        );
      case "pieces":
        return order.pieces.length ? order.pieces.join(" · ") : "—";
      case "tailor":
        return order.tailor ?? "—";
      case "amount_paid":
      case "total_price":
      case "caution_amount":
        return formatNumber(order[column], locale);
      case "balance":
        return formatNumber(order.balance ?? 0, locale);
      case "order_no":
        return <bdi>{order.order_no}</bdi>;
      case "status": {
        const late = order.status === "en_cours" && daysBetween(today, order.return_due_date) < 0;
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
                  count: formatNumber(-daysBetween(today, order.return_due_date), locale),
                })
              : t(`orders.status.${STATUS_KEYS[order.status]}`)}
          </Badge>
        );
      }
    }
  }

  return (
    <>
      <p className="text-muted-foreground mt-4 text-sm">
        {t("orders.countTotal", { count: total, n: formatNumber(total, locale) })}
      </p>

      <div
        ref={scroller}
        className="border-border mt-2 h-[calc(100dvh-16rem)] min-h-80 overflow-auto overscroll-contain rounded-lg border md:h-[calc(100dvh-13rem)]"
      >
        <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              {COLUMNS.map((column, i) => {
                const sortable = column in SORTABLE;
                const active = sortable && sort === column;
                const money = MONEY.includes(column);
                const label = t(HEADERS[column]);
                return (
                  <th
                    key={column}
                    scope="col"
                    aria-sort={active ? (ascending ? "ascending" : "descending") : undefined}
                    className={cn(
                      "bg-muted text-muted-foreground border-border sticky top-0 z-10 border-b px-3 py-0 font-medium whitespace-nowrap",
                      i > 0 && "border-s",
                      // Le nom du client reste collé au bord pendant qu'on
                      // fait glisser les colonnes — et passe au-dessus d'elles.
                      i === 0 && "start-0 z-20 border-e",
                      money ? "text-end" : "text-start",
                    )}
                  >
                    {sortable ? (
                      <Link
                        href={sortHref(column as SortKey)}
                        className={cn(
                          "hover:text-foreground flex min-h-11 items-center gap-1",
                          money && "justify-end",
                          active && "text-foreground",
                        )}
                      >
                        {label}
                        {active &&
                          (ascending ? (
                            <ArrowUp className="size-3.5 shrink-0" aria-hidden />
                          ) : (
                            <ArrowDown className="size-3.5 shrink-0" aria-hidden />
                          ))}
                      </Link>
                    ) : (
                      <span className="flex min-h-11 items-center">{label}</span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((order, r) => (
              <tr
                key={order.id}
                // Toute la ligne s'ouvre au toucher ; le vrai lien reste sur
                // le nom (focus clavier, nom accessible).
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("a,button")) return;
                  router.push(`/commandes/${order.id}`, { locale });
                }}
                className="hover:[&>td]:bg-accent cursor-pointer"
              >
                {COLUMNS.map((column, i) => (
                  <td
                    key={column}
                    className={cn(
                      "border-border h-12 border-b px-3 align-middle whitespace-nowrap",
                      r % 2 ? STRIPE : "bg-background",
                      i > 0 && "border-s",
                      i === 0 && "sticky start-0 z-1 max-w-44 truncate border-e",
                      MONEY.includes(column) && "tabular text-end",
                      (column === "picked_up" || column === "returned") && "text-center",
                      column === "pieces" && "max-w-96 truncate",
                      column === "tailor" && "max-w-48 truncate",
                      column === "balance" &&
                        (order.balance ?? 0) > 0 &&
                        "text-warning-foreground font-medium",
                    )}
                    title={
                      column === "pieces"
                        ? order.pieces.join(" · ")
                        : column === "customer_name"
                          ? order.customer_name
                          : undefined
                    }
                  >
                    {cell(order, column)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {/* Le repère de bas de liste : quand il approche, la suite arrive. */}
        <div ref={sentinel} className="flex h-14 items-center justify-center" aria-live="polite">
          {loading ? (
            <Spinner className="text-muted-foreground" />
          ) : done ? (
            <span className="text-muted-foreground text-xs">{t("orders.endOfList")}</span>
          ) : null}
        </div>
      </div>
    </>
  );
}
