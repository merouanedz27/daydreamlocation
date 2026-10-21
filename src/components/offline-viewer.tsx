"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CircleCheck, Pencil, Phone, Plane, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOnline, useOutbox } from "@/components/offline-sync";
import { PendingOrders } from "@/components/pending-orders";
import {
  getSnapshot,
  OUTBOX_EVENT,
  SNAPSHOT_EVENT,
  sendOrQueue,
  setOfflineContext,
} from "@/lib/offline/outbox";
import type { OfflineOrder, OfflineSnapshot } from "@/lib/offline/types";
import { formatDate, formatDayMonth, formatMoney, formatTime } from "@/lib/format";
import { addDays, daysBetween, todayIso } from "@/lib/rental-range";
import { matchesSearch } from "@/lib/search";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/routing";

type Tab = "tomorrow" | "out" | "search";
const TABS: Tab[] = ["tomorrow", "out", "search"];

/**
 * Les commandes SANS RÉSEAU — le dernier cliché gardé sur le téléphone.
 *
 * Trois vues, celles qu'on ouvre au comptoir : Demain, Pas rentrés, et une
 * recherche (nom, téléphone, n°, pièce). Le téléphone du client s'appelle
 * même hors ligne ; ✈ / ✓ partent dans la file et seront envoyés au retour du
 * réseau. Rien ne se crée ici : une réservation se décide en base.
 *
 * La date du cliché est toujours affichée : ce sont des données d'il y a un
 * moment, pas l'état de la boutique à l'instant.
 */
export function OfflineViewer({ locale }: { locale: Locale }) {
  const t = useTranslations("offline");
  const online = useOnline();
  const items = useOutbox();
  const [snapshot, setSnapshot] = useState<OfflineSnapshot | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>("tomorrow");
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    const load = () =>
      getSnapshot().then((next) => {
        if (!alive) return;
        setSnapshot(next ?? null);
        if (next) setOfflineContext({ userId: next.userId, locale });
      });
    load();
    window.addEventListener(SNAPSHOT_EVENT, load);
    window.addEventListener(OUTBOX_EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(SNAPSHOT_EVENT, load);
      window.removeEventListener(OUTBOX_EVENT, load);
    };
  }, [locale]);

  // Pas encore lu : rien, pour ne pas faire clignoter « aucune donnée ».
  if (snapshot === undefined) return null;
  if (snapshot === null) {
    return <p className="text-muted-foreground mt-8 text-center text-sm">{t("noSnapshot")}</p>;
  }

  const pending = items.filter((i) => i.userId === snapshot.userId && i.status === "pending").length;
  const today = todayIso();
  const tomorrow = addDays(today, 1);

  const shown: OfflineOrder[] =
    tab === "tomorrow"
      ? snapshot.orders.filter((o) => o.event_date === tomorrow)
      : tab === "out"
        ? snapshot.orders
            .filter((o) => o.picked_up && !o.returned)
            .sort((a, b) => a.return_due_date.localeCompare(b.return_due_date))
        : q.trim()
          ? snapshot.orders.filter((o) =>
              matchesSearch(
                q,
                o.customer_name,
                o.customer_phone,
                o.order_no,
                ...o.lines.flatMap((l) => [l.label, l.ref]),
              ),
            )
          : [];

  return (
    <section className="mt-8 text-start" aria-labelledby="offline-orders">
      <div className="border-warning-foreground/30 bg-warning-soft text-warning-foreground rounded-lg border px-3 py-2 text-sm">
        <h2 id="offline-orders" className="font-medium">
          {t("snapshotOf", {
            date: formatDayMonth(snapshot.syncedAt, locale),
            time: formatTime(snapshot.syncedAt, locale),
          })}
        </h2>
        <p className="mt-0.5 text-xs">
          {pending ? t("offlinePending", { count: pending }) : t("viewerHint")}
          {online && ` · ${t("backOnline")}`}
        </p>
      </div>

      {/* Une commande saisie ici est PROVISOIRE : le formulaire le dit. */}
      <Button asChild className="mt-4 h-12 w-full text-base">
        <a href={`/${locale}/hors-ligne/nouvelle`}>
          <Plus className="size-4" aria-hidden />
          {t("newOrderProvisional")}
        </a>
      </Button>

      <div className="mt-4">
        <PendingOrders locale={locale} userId={snapshot.userId} />
      </div>

      <div role="tablist" className="bg-muted mt-4 grid grid-cols-3 gap-1 rounded-lg p-1">
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "min-h-11 rounded-md px-2 text-sm",
              tab === key ? "bg-card font-medium shadow-sm" : "text-muted-foreground",
            )}
          >
            {t(`tabs.${key}`)}
          </button>
        ))}
      </div>

      {tab === "search" && (
        <div className="relative mt-3">
          <Search
            className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            className="h-12 ps-9 text-base"
          />
        </div>
      )}

      <p className="text-muted-foreground mt-3 text-xs">{t("count", { count: shown.length })}</p>

      {shown.length > 0 && (
        <ul className="mt-2 space-y-2">
          {shown.map((order) => (
            <OfflineOrderCard
              key={order.id}
              order={order}
              locale={locale}
              action={tab === "out" || order.picked_up ? "returned" : "picked_up"}
              today={today}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function OfflineOrderCard({
  order,
  locale,
  action,
  today,
}: {
  order: OfflineOrder;
  locale: Locale;
  action: "picked_up" | "returned";
  today: string;
}) {
  const t = useTranslations();
  const [isPending, startTransition] = useTransition();
  const checked = action === "picked_up" ? order.picked_up : order.returned;
  const label = action === "picked_up" ? t("orders.pickedUp") : t("orders.returned");
  const Icon = action === "picked_up" ? Plane : CircleCheck;
  const late = action === "returned" && daysBetween(today, order.return_due_date) < 0;

  function toggle() {
    startTransition(async () => {
      const result = await sendOrQueue(
        { kind: "check", orderId: order.id, field: action, value: !checked },
        `${label} — ${order.customer_name}`,
      );
      if (!result.ok) toast.error(t(result.error));
      else if (result.queued) toast(t("offline.queuedToast"));
    });
  }

  return (
    <li className="border-border bg-card rounded-lg border p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{order.customer_name}</p>
          <p className="text-muted-foreground tabular text-xs">
            {order.order_no} ·{" "}
            {action === "returned"
              ? t("offline.returnDue", { date: formatDate(`${order.return_due_date}T12:00:00+01:00`, locale) })
              : t("offline.eventOn", { date: formatDate(`${order.event_date}T12:00:00+01:00`, locale) })}
            {late && <span className="text-warning-foreground font-medium"> · {t("offline.late")}</span>}
          </p>
        </div>

        {order.customer_phone && (
          // `tel:` marche sans réseau : c'est le geste de « Pas rentrés ».
          <a
            href={`tel:${order.customer_phone}`}
            className="border-border flex size-11 shrink-0 items-center justify-center rounded-full border"
          >
            <Phone className="size-4 rtl:-scale-x-100" aria-hidden />
            <span className="sr-only">{t("offline.call", { name: order.customer_name })}</span>
          </a>
        )}

        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={`${label} — ${order.customer_name}`}
          disabled={isPending}
          onClick={toggle}
          className={cn(
            "press flex size-11 shrink-0 items-center justify-center rounded-full border",
            checked ? "bg-primary text-primary-foreground border-transparent" : "border-border bg-card",
          )}
        >
          <Icon className={cn("size-4", action === "picked_up" && "rtl:-scale-x-100")} aria-hidden />
        </button>
      </div>

      {order.lines.length > 0 && (
        <ul className="text-muted-foreground mt-2 space-y-0.5 text-sm">
          {order.lines.map((line, i) => (
            <li key={i} className="truncate">
              {line.label}
              {line.size && ` · ${line.size}`}
              {line.ref && <span className="tabular"> · {line.ref}</span>}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex justify-end">
        <a
          href={`/${locale}/hors-ligne/modifier?id=${order.id}`}
          className="text-muted-foreground inline-flex min-h-11 items-center gap-1.5 px-2 text-sm"
        >
          <Pencil className="size-4" aria-hidden />
          {t("offline.editOrder")}
        </a>
      </div>

      {(order.balance > 0 || (order.caution_amount > 0 && !order.caution_returned)) && (
        <p className="mt-2 flex flex-wrap gap-x-3 text-sm">
          {order.balance > 0 && (
            <span className="text-warning-foreground font-medium">
              {t("offline.balance", { amount: formatMoney(order.balance, locale) })}
            </span>
          )}
          {order.caution_amount > 0 && !order.caution_returned && (
            <span className="text-muted-foreground">
              {t("offline.caution", { amount: formatMoney(order.caution_amount, locale) })}
            </span>
          )}
        </p>
      )}
    </li>
  );
}
