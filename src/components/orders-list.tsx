"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  CalendarPlus,
  Check,
  CircleCheck,
  Plane,
  Plus,
  Printer,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { MessageButton } from "@/components/customer-message";
import { Highlight } from "@/components/highlight";
import { SelectBox } from "@/components/select-box";
import { deleteOrders, setOrdersChecks, type BulkResult } from "@/lib/actions/orders";
import { loadMoreOrders } from "@/lib/actions/orders-list";
import {
  DONE_NAME_CLASS,
  ORDERS_PARAM_KEYS,
  ROW_TONE_CLASS,
  SORTABLE,
  STATUS_BADGE_CLASS,
  isOrderDone,
  orderTone,
  type OrderTableRow,
  type SortKey,
} from "@/lib/orders-query";
import { formatDate, formatNumber } from "@/lib/format";
import { daysBetween, todayIso } from "@/lib/rental-range";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/routing";

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
  "message",
  "event_date",
  "picked_up",
  "returned",
  "costume",
  "sizes",
  "tailor",
  "shirt",
  "shoes",
  "accessories",
  "amount_paid",
  "total_price",
  "balance",
  "caution_amount",
  "pickup_date",
  "return_due_date",
  "order_no",
  "status",
  "created_by_name",
] as const;

type Column = (typeof COLUMNS)[number];

const HEADERS: Record<Column, string> = {
  customer_name: "orders.short.customer",
  customer_phone: "orders.short.phone",
  message: "orders.short.message",
  event_date: "orders.short.eventDate",
  picked_up: "orders.short.pickedUp",
  returned: "orders.short.returned",
  costume: "orders.short.costume",
  sizes: "orders.short.sizes",
  tailor: "orders.short.tailor",
  shirt: "orders.short.shirt",
  shoes: "orders.short.shoes",
  accessories: "orders.short.accessories",
  amount_paid: "orders.short.paid",
  total_price: "orders.short.total",
  balance: "orders.short.balance",
  caution_amount: "orders.short.caution",
  pickup_date: "orders.short.pickupDate",
  return_due_date: "orders.short.returnDue",
  order_no: "orders.short.orderNo",
  status: "orders.short.status",
  created_by_name: "orders.short.createdBy",
};

/** Colonnes réservées au propriétaire : qui a saisi la commande. */
const OWNER_ONLY: Column[] = ["created_by_name"];

const MONEY: Column[] = ["amount_paid", "total_price", "balance", "caution_amount"];

/** Colonnes de texte libre : bornées, le reste se lit au survol (`title`). */
const TEXT: Column[] = ["costume", "sizes", "tailor", "shirt", "shoes", "accessories"];

/** Durée d'un appui long, en millisecondes — celle des menus d'Android. */
const LONG_PRESS_MS = 500;

/**
 * Les éléments d'une ligne qui gardent LEUR geste : cases, boutons ✈ / ✓,
 * téléphone, message. Le nom du client, lui, se comporte comme la ligne.
 */
function keepsOwnTap(target: EventTarget): boolean {
  const el = target as HTMLElement;
  if (el.closest("button,label,input")) return true;
  const link = el.closest("a");
  return Boolean(link && !link.hasAttribute("data-row-link"));
}

/**
 * Le tableau des commandes, COMME SON APPSHEET : toutes les colonnes, et on
 * fait défiler — vers la droite pour les colonnes, vers le bas pour les
 * commandes, qui arrivent d'elles-mêmes par tranches quand on approche du bas.
 * Plus de pages, plus de choix de colonnes, plus de bascule liste / tableau.
 *
 * Le tableau défile DANS son cadre (hauteur de l'écran), l'en-tête collé en
 * haut. Le nom du client défile avec les autres colonnes, comme sur son
 * AppSheet : tout l'écran sert aux colonnes. Chaque ligne prend la couleur de
 * son statut (`orderTone`).
 *
 * Le parent remonte le composant à chaque changement de filtre (`key`) : la
 * liste repart de la première tranche.
 */
export function OrdersList({
  initialRows,
  total,
  sort,
  ascending,
  isOwner,
}: {
  initialRows: OrderTableRow[];
  total: number;
  sort: SortKey;
  ascending: boolean;
  isOwner: boolean;
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
  /** Commandes supprimées depuis ce tableau : le total affiché les retire. */
  const [removed, setRemoved] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, startTransition] = useTransition();
  const scroller = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const shownTotal = Math.max(total - removed, rows.length);
  const done = exhausted || rows.length >= shownTotal;
  const columns = isOwner ? COLUMNS : COLUMNS.filter((c) => !OWNER_ONLY.includes(c));

  // Une tranche de plus quand le bas du tableau approche (200 px d'avance :
  // la suite est déjà là quand le doigt y arrive).
  useEffect(() => {
    if (done || !sentinel.current) return;
    const filters = Object.fromEntries(
      ORDERS_PARAM_KEYS.map((key) => [key, params.get(key) ?? undefined]),
    );
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

  const searched = params.get("q")?.trim() ?? "";

  // Une recherche qui trouve sa réponse dans une colonne lointaine (Costume,
  // N°…) : sur téléphone, le tableau GLISSE de lui-même jusqu'à la première
  // cellule surlignée. Le parent remonte la liste à chaque recherche (`key`),
  // donc ceci ne joue qu'une fois par recherche — jamais au chargement de la
  // suite. `scrollBy` en pixels d'écran : même geste en français et en arabe.
  useEffect(() => {
    if (searched.length < 2) return;
    const frame = requestAnimationFrame(() => {
      const box = scroller.current;
      // L'utilisateur a déjà fait glisser le tableau : on ne le contrarie pas.
      if (!box || box.scrollLeft !== 0) return;
      const cell = box.querySelector("tbody mark")?.closest("td");
      if (!cell) return;
      const c = cell.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      if (c.left >= b.left && c.right <= b.right) return;
      box.scrollBy({
        left: c.left + c.width / 2 - (b.left + b.width / 2),
        behavior: "smooth",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [searched]);

  const hasFilters = Boolean(params.get("q") || params.get("statut"));

  /**
   * La sélection ne porte que sur les lignes CHARGÉES : « tout sélectionner »
   * prend ce que l'équipe a sous les yeux, jamais des commandes qu'elle n'a
   * pas vues plus bas dans la liste.
   */
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someSelected = selected.size > 0 && !allSelected;
  /**
   * Les cases n'apparaissent qu'en MODE SÉLECTION, ouvert par un appui long :
   * au repos, le tableau reste celui de son AppSheet, sans colonne en plus.
   */
  const selecting = selected.size > 0;

  function toggleOne(id: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /**
   * Appui long sur une ligne : elle se sélectionne. Le doigt qui glisse fait
   * défiler le tableau — au-delà de quelques pixels, ce n'est plus un appui.
   */
  const press = useRef<{ timer: number; x: number; y: number } | null>(null);
  /** L'appui long vient d'aboutir : le « clic » du relâché est avalé. */
  const longPressed = useRef(false);

  function startPress(e: React.PointerEvent, id: number) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (keepsOwnTap(e.target)) return;
    cancelPress();
    longPressed.current = false;
    const timer = window.setTimeout(() => {
      press.current = null;
      longPressed.current = true;
      navigator.vibrate?.(30);
      toggleOne(id);
    }, LONG_PRESS_MS);
    press.current = { timer, x: e.clientX, y: e.clientY };
  }

  function movePress(e: React.PointerEvent) {
    const p = press.current;
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) cancelPress();
  }

  function cancelPress() {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  }

  /** Recopie ce que la base a gardé : le statut vient du trigger, pas de l'écran. */
  function applyRows(changed: Extract<BulkResult, { ok: true }>["rows"]) {
    const byId = new Map(changed.map((r) => [r.id, r]));
    setRows((current) =>
      current.map((row) => {
        const fresh = byId.get(row.id);
        return fresh ? { ...row, ...fresh } : row;
      }),
    );
  }

  function checksData(ids: number[], field: "picked_up" | "returned", value: boolean) {
    const data = new FormData();
    data.set("ids", ids.join(","));
    data.set("locale", locale);
    data.set("field", field);
    data.set("value", value ? "1" : "0");
    return data;
  }

  /** ✈ / ✓ sur toute la sélection : on VALIDE, on ne bascule pas. */
  function bulkCheck(field: "picked_up" | "returned") {
    const ids = [...selected];
    const label = field === "picked_up" ? t("orders.pickedUp") : t("orders.returned");
    startTransition(async () => {
      const result = await setOrdersChecks(checksData(ids, field, true));
      if (!result.ok) {
        toast.error(t(result.error));
        return;
      }
      applyRows(result.rows);
      setSelected(new Set());
      toast.success(
        t("orders.bulkChecked", {
          label,
          count: result.rows.length,
          n: formatNumber(result.rows.length, locale),
        }),
      );
      if (result.rows.length < ids.length) toast.info(t("orders.bulkSkipped"));
    });
  }

  /**
   * Une case ✗ / ✓ du tableau se coche au doigt, comme la case de la fiche.
   * Optimiste : elle répond tout de suite et revient en arrière si la base
   * refuse (commande annulée, droits).
   */
  function toggleCell(order: OrderTableRow, field: "picked_up" | "returned") {
    const next = !order[field];
    const before = {
      picked_up: order.picked_up,
      returned: order.returned,
      status: order.status,
    };
    setRows((current) => current.map((r) => (r.id === order.id ? { ...r, [field]: next } : r)));
    startTransition(async () => {
      const result = await setOrdersChecks(checksData([order.id], field, next));
      if (result.ok && result.rows.length) {
        applyRows(result.rows);
        return;
      }
      setRows((current) => current.map((r) => (r.id === order.id ? { ...r, ...before } : r)));
      toast.error(t(result.ok ? "orders.bulkSkipped" : result.error));
    });
  }

  const selectedRows = rows.filter((r) => selected.has(r.id));
  const NAMES_SHOWN = 5;
  const deleteNames =
    selectedRows
      .slice(0, NAMES_SHOWN)
      .map((r) => `${r.customer_name} (${r.order_no})`)
      .join(", ") + (selectedRows.length > NAMES_SHOWN ? "…" : "");

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
          <div className="flex items-center">
            {selecting && (
              <SelectBox
                checked={selected.has(order.id)}
                onChange={() => toggleOne(order.id)}
                label={t("orders.selectNamed", { name: order.customer_name })}
              />
            )}
            <Link
              href={`/commandes/${order.id}`}
              data-row-link
              className={cn(
                "hover:text-gold-strong text-foreground text-[13px] font-bold underline-offset-4 hover:underline",
                isOrderDone(order) && DONE_NAME_CLASS,
              )}
            >
              <Highlight text={order.customer_name} />
            </Link>
            {/* Le bon de location en un toucher, sans passer par la fiche. */}
            <Link
              href={`/imprimer/commande/${order.id}`}
              aria-label={t("orders.printNamed", { name: order.customer_name })}
              className="press text-muted-foreground hover:text-foreground hover:bg-muted active:bg-muted ms-1 flex size-9 shrink-0 items-center justify-center rounded-full"
            >
              <Printer className="size-4" aria-hidden />
            </Link>
          </div>
        );
      case "customer_phone":
        return order.customer_phone ? (
          <a href={`tel:${order.customer_phone}`} className="hover:underline" dir="ltr">
            <Highlight text={order.customer_phone} />
          </a>
        ) : (
          "—"
        );
      case "message":
        return order.customer_phone ? (
          <MessageButton order={order} phone={order.customer_phone} className="mx-auto" />
        ) : (
          "—"
        );
      case "event_date":
      case "pickup_date":
      case "return_due_date":
        return <span className="tabular">{formatDate(order[column], locale)}</span>;
      case "picked_up":
      case "returned": {
        // ✗ / ✓ comme les deux colonnes de son AppSheet — et un toucher les bascule.
        const label = column === "picked_up" ? t("orders.pickedUp") : t("orders.returned");
        return (
          <button
            type="button"
            role="switch"
            aria-checked={order[column]}
            aria-label={t("orders.checkedToast", {
              label,
              name: order.customer_name,
            })}
            disabled={busy || order.status === "annulee"}
            onClick={() => toggleCell(order, column)}
            className="press hover:bg-muted active:bg-muted mx-auto flex size-11 items-center justify-center rounded-full disabled:opacity-60"
          >
            {order[column] ? (
              <Check className="text-success-foreground size-5" aria-hidden />
            ) : (
              <X className="text-destructive/70 size-4" aria-hidden />
            )}
          </button>
        );
      }
      case "costume":
      case "sizes":
      case "tailor":
      case "shirt":
      case "shoes":
      case "accessories":
        return order[column] ? <Highlight text={order[column]} /> : "—";
      case "created_by_name":
        return order.created_by_name ?? "—";
      case "amount_paid":
      case "total_price":
      case "caution_amount":
        return formatNumber(order[column], locale);
      case "balance":
        return formatNumber(order.balance ?? 0, locale);
      case "order_no":
        return (
          <bdi>
            <Highlight text={order.order_no} />
          </bdi>
        );
      case "status": {
        const tone = orderTone(order, today);
        const late = tone === "late";
        return (
          <Badge className={STATUS_BADGE_CLASS[tone]}>
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
      {selected.size ? (
        // La barre de la sélection prend la place du compteur : les gestes
        // restent au-dessus du tableau, sous le pouce.
        <div
          role="toolbar"
          aria-label={t("orders.selectedCount", {
            count: selected.size,
            n: formatNumber(selected.size, locale),
          })}
          className="bg-gold-soft mt-3 flex flex-wrap items-center gap-2 rounded-lg p-1.5"
        >
          <Button
            type="button"
            variant="ghost"
            onClick={() => setSelected(new Set())}
            aria-label={t("orders.clearSelection")}
            className="size-11"
          >
            <X className="size-5" aria-hidden />
          </Button>
          <span className="me-auto text-sm font-medium">
            {t("orders.selectedCount", {
              count: selected.size,
              n: formatNumber(selected.size, locale),
            })}
          </span>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => bulkCheck("picked_up")}
            className="bg-background h-11"
          >
            {busy ? (
              <Spinner className="size-4" />
            ) : (
              <Plane className="size-4 rtl:-scale-x-100" aria-hidden />
            )}
            {t("orders.pickedUp")}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => bulkCheck("returned")}
            className="bg-background h-11"
          >
            {busy ? <Spinner className="size-4" /> : <CircleCheck className="size-4" aria-hidden />}
            {t("orders.returned")}
          </Button>
          {/* Supprimer reste au propriétaire, comme sur la fiche. */}
          {isOwner && (
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
              className="h-11"
            >
              <Trash2 className="size-4" aria-hidden />
              {t("common.delete")}
            </Button>
          )}
        </div>
      ) : (
        <p className="text-muted-foreground mt-4 text-sm">
          {t("orders.countTotal", {
            count: shownTotal,
            n: formatNumber(shownTotal, locale),
          })}
        </p>
      )}

      {isOwner && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          icon={<Trash2 className="size-4" />}
          title={t("orders.deleteManyTitle", {
            count: selectedRows.length,
            n: formatNumber(selectedRows.length, locale),
          })}
          description={t("orders.deleteManyBody", { names: deleteNames })}
          confirmLabel={t("orders.deleteOrder")}
          cancelLabel={t("orders.keepOrder")}
          onConfirm={async () => {
            const data = new FormData();
            data.set("ids", selectedRows.map((r) => r.id).join(","));
            data.set("locale", locale);
            const result = await deleteOrders(data);
            if (!result.ok) return result;
            const gone = new Set(result.rows.map((r) => r.id));
            setRows((current) => current.filter((r) => !gone.has(r.id)));
            setRemoved((n) => n + gone.size);
            setSelected(new Set());
            toast.success(
              t("orders.deletedMany", {
                count: gone.size,
                n: formatNumber(gone.size, locale),
              }),
            );
            return { ok: true };
          }}
        />
      )}

      <div
        ref={scroller}
        className="border-border mt-2 h-[calc(100dvh-16rem)] min-h-80 overflow-auto overscroll-contain rounded-lg border md:h-[calc(100dvh-13rem)]"
      >
        <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              {columns.map((column, i) => {
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
                      i === 0 && selecting && "ps-0",
                      money ? "text-end" : "text-start",
                    )}
                  >
                    <div className="flex items-center">
                      {i === 0 && selecting && (
                        <SelectBox
                          checked={allSelected}
                          indeterminate={someSelected}
                          onChange={toggleAll}
                          label={t("orders.selectAll")}
                        />
                      )}
                      {sortable ? (
                        <Link
                          href={sortHref(column as SortKey)}
                          className={cn(
                            "hover:text-foreground flex min-h-11 flex-1 items-center gap-1",
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
                        <span className="flex min-h-11 flex-1 items-center">{label}</span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((order) => (
              <tr
                key={order.id}
                // Appui long = sélection, comme dans la galerie du téléphone.
                onPointerDown={(e) => {
                  startPress(e, order.id);
                  // Le doigt se pose ~100 ms avant le clic : la commande se
                  // charge déjà quand il se relève.
                  if (!selected.size) router.prefetch(`/commandes/${order.id}`, { locale });
                }}
                onPointerMove={movePress}
                onPointerUp={cancelPress}
                onPointerCancel={cancelPress}
                onPointerLeave={cancelPress}
                // Sans cela, Android ouvre son menu « Ouvrir le lien… » sous le doigt.
                onContextMenu={(e) => {
                  if (press.current || longPressed.current) e.preventDefault();
                }}
                // En PHASE DE CAPTURE : le relâché d'un appui long, et tout
                // toucher en mode sélection, ne doivent pas atteindre le lien
                // du nom — sinon la commande s'ouvrirait.
                onClickCapture={(e) => {
                  if (longPressed.current) {
                    longPressed.current = false;
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                  }
                  if (selected.size && !keepsOwnTap(e.target)) {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleOne(order.id);
                  }
                }}
                // Toute la ligne s'ouvre au toucher ; le vrai lien reste sur
                // le nom (focus clavier, nom accessible).
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("a,button,label,input")) return;
                  router.push(`/commandes/${order.id}`, { locale });
                }}
                aria-selected={selected.has(order.id)}
                className={cn(
                  "cursor-pointer select-none [-webkit-touch-callout:none] [&>td]:transition-[filter]",
                  // TOUTE la ligne à la couleur de son statut ; le survol et
                  // le toucher l'assombrissent sans la changer.
                  ROW_TONE_CLASS[orderTone(order, today)],
                  "hover:[&>td]:brightness-95 active:[&>td]:brightness-90",
                  // La sélection se voit par-dessus la couleur : un liseré épais.
                  selected.has(order.id) &&
                    "[&>td]:shadow-[inset_0_2px_0_var(--gold-strong),inset_0_-2px_0_var(--gold-strong)] [&>td]:brightness-90",
                )}
              >
                {columns.map((column, i) => (
                  <td
                    key={column}
                    className={cn(
                      "border-border h-11 border-b px-3 align-middle whitespace-nowrap",
                      i > 0 && "border-s",
                      i === 0 && selecting && "ps-0",
                      MONEY.includes(column) && "tabular text-end",
                      (column === "picked_up" || column === "returned" || column === "message") &&
                        "text-center",
                      column === "message" && "px-1",
                      TEXT.includes(column) && "max-w-64 truncate",
                      column === "balance" &&
                        (order.balance ?? 0) > 0 &&
                        "text-warning-foreground font-medium",
                    )}
                    title={TEXT.includes(column) ? (order[column as "costume"] ?? undefined) : undefined}
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
