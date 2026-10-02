"use client";

import { useOptimistic, useTransition } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CircleCheck, MessageSquare, Phone, Plane } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { Link } from "@/i18n/navigation";
import { setOrderChecks } from "@/lib/actions/orders";
import { formatDate, formatNumber } from "@/lib/format";
import { DONE_NAME_CLASS, isOrderDone, type OrderRow as Order } from "@/lib/orders-query";
import { daysBetween, todayIso } from "@/lib/rental-range";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/routing";

/**
 * Une commande sur UNE ligne, comme dans son AppSheet :
 *
 *   ✈ ✓  Nom du client                     📞  💬   03/10/2026
 *
 * - ✈ : la tenue est sortie (« Allez validé ») ;
 * - ✓ : elle est revenue (« Retour validé »). Les DEUX cochées, la commande
 *   est terminée et son nom est BARRÉ (`isOrderDone`) — c'est ainsi que
 *   l'équipe repère d'un coup d'œil ce qui n'appelle plus rien ;
 * - 📞 et 💬 appellent ou écrivent au client sans ouvrir la fiche : c'est le
 *   geste le plus fréquent de « Demain » et de « Pas rentrés ».
 *
 * `action` ajoute un bouton de validation en un toucher (✈ sur « Demain »,
 * ✓ sur « Pas rentrés ») : l'employé coche depuis la liste, sans passer par
 * la fiche. Même action serveur que les cases de la fiche.
 */
export function OrderListRow({
  order,
  date = "event",
  action,
}: {
  order: Order;
  /** Date affichée en bout de ligne : l'événement, ou le retour prévu. */
  date?: "event" | "return";
  action?: "picked_up" | "returned";
}) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();

  const late =
    order.picked_up && !order.returned && daysBetween(todayIso(), order.return_due_date) < 0;
  const shownDate = date === "return" ? order.return_due_date : order.event_date;

  return (
    <li className="border-border flex items-center gap-1 border-b last:border-b-0">
      <Link
        href={`/commandes/${order.id}`}
        className="hover:bg-muted/60 flex min-h-14 min-w-0 flex-1 items-center gap-2 py-2 ps-3 pe-1"
      >
        <StatusIcons pickedUp={order.picked_up} returned={order.returned} />
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block truncate font-medium",
              isOrderDone(order) && DONE_NAME_CLASS,
            )}
          >
            {order.customer_name}
          </span>
          <span
            className={cn(
              "tabular block text-xs",
              late ? "text-warning-foreground font-medium" : "text-muted-foreground",
            )}
          >
            {late
              ? t("orders.lateBy", {
                  count: formatNumber(-daysBetween(todayIso(), order.return_due_date), locale),
                })
              : formatDate(shownDate, locale)}
          </span>
        </span>
      </Link>

      {order.customer_phone && (
        <>
          <a
            href={`tel:${order.customer_phone}`}
            aria-label={t("orders.callNamed", { name: order.customer_name })}
            className="text-muted-foreground hover:text-foreground hover:bg-muted flex size-11 shrink-0 items-center justify-center rounded-full"
          >
            <Phone className="size-5" aria-hidden />
          </a>
          <a
            href={`sms:${order.customer_phone}`}
            aria-label={t("orders.smsNamed", { name: order.customer_name })}
            className="text-muted-foreground hover:text-foreground hover:bg-muted flex size-11 shrink-0 items-center justify-center rounded-full"
          >
            <MessageSquare className="size-5" aria-hidden />
          </a>
        </>
      )}

      {action && (
        <QuickCheck
          orderId={order.id}
          field={action}
          checked={action === "picked_up" ? order.picked_up : order.returned}
          name={order.customer_name}
        />
      )}
    </li>
  );
}

/**
 * ✈ puis ✓, à la même place sur chaque ligne : une colonne d'icônes qui ne se
 * décale pas se lit de haut en bas. Une place vide reste réservée — sinon les
 * noms ne seraient plus alignés entre une commande sortie et une autre.
 */
function StatusIcons({ pickedUp, returned }: { pickedUp: boolean; returned: boolean }) {
  const t = useTranslations();
  return (
    <span className="flex shrink-0 items-center gap-1">
      <span className="flex size-5 items-center justify-center">
        {(pickedUp || returned) && (
          <Plane className="text-gold-strong size-4 rtl:-scale-x-100" aria-label={t("orders.pickedUp")} />
        )}
      </span>
      <span className="flex size-5 items-center justify-center">
        {returned && <CircleCheck className="text-success-foreground size-4" aria-label={t("orders.returned")} />}
      </span>
    </span>
  );
}

/**
 * Validation en un toucher depuis la liste. Optimiste comme les cases de la
 * fiche : la coche répond au doigt et revient d'elle-même à la vérité de la
 * base si l'écriture échoue.
 */
function QuickCheck({
  orderId,
  field,
  checked,
  name,
}: {
  orderId: number;
  field: "picked_up" | "returned";
  checked: boolean;
  name: string;
}) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const [isPending, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(checked);

  const label = field === "picked_up" ? t("orders.pickedUp") : t("orders.returned");
  const Icon = field === "picked_up" ? Plane : CircleCheck;

  function toggle() {
    const next = !checked;
    const data = new FormData();
    data.set("id", String(orderId));
    data.set("locale", locale);
    data.set("field", field);
    data.set("value", next ? "1" : "0");

    startTransition(async () => {
      setShown(next);
      const result = await setOrderChecks(data);
      if (!result.ok) toast.error(t(result.error));
      else if (next) toast.success(t("orders.checkedToast", { label, name }));
    });
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={shown}
      aria-label={`${label} — ${name}`}
      disabled={isPending}
      onClick={toggle}
      className={cn(
        "me-2 flex h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-full border px-3 text-sm transition-colors",
        shown
          ? "bg-primary text-primary-foreground border-transparent"
          : "border-border bg-card hover:border-gold-strong",
      )}
    >
      {isPending ? (
        <Spinner className="size-4" />
      ) : (
        <Icon className={cn("size-4", field === "picked_up" && "rtl:-scale-x-100")} aria-hidden />
      )}
    </button>
  );
}

/** Le cadre d'une liste de lignes : une carte, des séparateurs fins. */
export function OrderRowList({
  orders,
  date,
  action,
}: {
  orders: Order[];
  date?: "event" | "return";
  action?: "picked_up" | "returned";
}) {
  return (
    <ul className="border-border bg-card overflow-hidden rounded-lg border">
      {orders.map((order) => (
        <OrderListRow key={order.id} order={order} date={date} action={action} />
      ))}
    </ul>
  );
}
