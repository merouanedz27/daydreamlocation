"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import type { Locale } from "@/i18n/routing";
import type { UnpaidOrder } from "@/lib/queries/dashboard";

/** Les premières dettes ; « Voir les N autres » déplie TOUTE la liste. */
const FIRST = 8;

export function UnpaidList({ orders, locale }: { orders: UnpaidOrder[]; locale: Locale }) {
  const t = useTranslations("dashboard");
  const [open, setOpen] = useState(false);
  const shown = open ? orders : orders.slice(0, FIRST);
  const hidden = orders.length - FIRST;

  return (
    <>
      <ul className="space-y-2">
        {shown.map((o) => (
          <li key={o.id}>
            <Link
              href={`/commandes/${o.id}`}
              className="hover:bg-accent -mx-2 flex min-h-11 items-center gap-3 rounded-md px-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{o.customer_name}</span>
                <span className="text-muted-foreground block truncate text-xs">
                  <bdi>{o.order_no}</bdi>
                  {" · "}
                  <span className="tabular">{formatDate(o.event_date, locale)}</span>
                </span>
              </span>
              <span className="text-warning-foreground tabular shrink-0 text-sm font-medium">
                {formatMoney(o.balance ?? 0, locale)}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {hidden > 0 && (
        <Button
          type="button"
          variant="outline"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="mt-3 h-11 w-full"
        >
          {open ? (
            <ChevronUp className="size-4" aria-hidden />
          ) : (
            <ChevronDown className="size-4" aria-hidden />
          )}
          {open
            ? t("unpaidShowLess")
            : t("unpaidShowAll", { count: formatNumber(hidden, locale) })}
        </Button>
      )}
    </>
  );
}
