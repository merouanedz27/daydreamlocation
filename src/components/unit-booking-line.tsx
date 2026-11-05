"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { CalendarClock } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { formatDayMonth, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { UnitBooking } from "@/lib/queries/stock";
import type { Locale } from "@/i18n/routing";

/**
 * Qui tient cette pièce : « Réservée · n°42 · 19/12 → 21/12 », « Sortie ·
 * n°42 · retour le 21/12 » ou « En retard · n°42 · prévu le 21/11 ». Un
 * toucher ouvre la commande. Rien si personne ne la tient.
 */
export function UnitBookingLine({
  bookings,
  className,
}: {
  /** La plus urgente d'abord (sortie avant réservations à venir). */
  bookings: UnitBooking[];
  className?: string;
}) {
  const t = useTranslations("stock.booking");
  const { locale } = useParams<{ locale: Locale }>();
  const b = bookings[0];
  if (!b) return null;

  const day = (d: string) => formatDayMonth(d, locale);
  const text = b.late
    ? t("late", { no: b.orderNo, date: day(b.returnDue) })
    : b.out
      ? t("out", { no: b.orderNo, date: day(b.returnDue) })
      : t("reserved", { no: b.orderNo, from: day(b.pickup), to: day(b.returnDue) });
  const more = bookings.length - 1;

  return (
    <Link
      href={`/commandes/${b.orderId}`}
      className={cn(
        "flex min-h-11 items-center gap-1.5 rounded-md px-2 text-xs font-medium",
        b.late ? "bg-row-late text-destructive" : b.out ? "bg-row-out" : "bg-row-reserved",
        className,
      )}
    >
      <CalendarClock className="size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">
        {text} · <bdi>{b.customer}</bdi>
      </span>
      {more > 0 && (
        <span className="text-muted-foreground tabular shrink-0">
          {t("more", { n: formatNumber(more, locale) })}
        </span>
      )}
    </Link>
  );
}
