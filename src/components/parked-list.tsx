"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronRight, PauseCircle, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ParkedDiscardDialog } from "@/components/parked-drafts-bar";
import { Link } from "@/i18n/navigation";
import { filledCount, useParked, type ParkedDraft } from "@/lib/parked-drafts";
import { formatDate, formatNumber, formatTime } from "@/lib/format";
import type { Locale } from "@/i18n/routing";

/**
 * Les clients EN ATTENTE de ce téléphone, une carte chacun, dans l'ordre
 * d'arrivée. Toucher la carte rouvre la saisie sur ce client.
 *
 * Rien ici ne vient de la base : la liste vit dans le téléphone
 * (`src/lib/parked-drafts.ts`) jusqu'à « Enregistrer ».
 */
export function ParkedList() {
  const t = useTranslations("orders.parked");
  const { locale } = useParams<{ locale: Locale }>();
  const parked = useParked();
  const [discarding, setDiscarding] = useState<ParkedDraft | null>(null);

  if (parked.length === 0) {
    return (
      <div className="border-border flex flex-col items-center rounded-lg border border-dashed px-6 py-14 text-center">
        <PauseCircle className="text-muted-foreground size-8" aria-hidden />
        <p className="mt-3 font-medium">{t("empty")}</p>
        <p className="text-muted-foreground mt-1 max-w-xs text-sm">{t("emptyHint")}</p>
        <Button asChild className="mt-5 min-h-11">
          <Link href="/commandes/nouvelle">
            <Plus className="size-4" aria-hidden />
            {t("emptyCta")}
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-3">
        {parked.map((item) => {
          const { draft } = item;
          const name = draft.customerName.trim();
          const count = filledCount(draft);
          const pieces = draft.slots
            .map((s) => s.name.trim())
            .filter(Boolean)
            .join(" · ");
          return (
            <li
              key={item.id}
              className="border-border bg-card relative flex items-stretch rounded-lg border"
            >
              <Link
                href={`/commandes/nouvelle?attente=${item.id}`}
                aria-label={t("open", { name })}
                className="press focus-visible:ring-ring flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-lg py-3 ps-4 pe-2 focus-visible:ring-2 focus-visible:outline-none"
              >
                <PauseCircle className="text-gold-strong size-5 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{name}</span>
                  <span className="text-muted-foreground block text-sm">
                    {draft.eventDate ? formatDate(draft.eventDate, locale) : t("noDate")}
                    {" · "}
                    {t("pieces", { count, n: formatNumber(count, locale) })}
                  </span>
                  {pieces && (
                    <span className="text-muted-foreground mt-0.5 block truncate text-xs">
                      {pieces}
                    </span>
                  )}
                  {item.parkedAt && (
                    <span className="text-muted-foreground mt-0.5 block text-xs">
                      {t("parkedAgo", { time: formatTime(item.parkedAt, locale) })}
                    </span>
                  )}
                </span>
                <ChevronRight
                  className="text-muted-foreground size-4 shrink-0 rtl:-scale-x-100"
                  aria-hidden
                />
              </Link>
              <button
                type="button"
                onClick={() => setDiscarding(item)}
                aria-label={t("discard", { name })}
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex w-12 shrink-0 items-center justify-center border-s focus-visible:ring-2 focus-visible:outline-none"
              >
                <X className="size-4" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
      <ParkedDiscardDialog item={discarding} onClose={() => setDiscarding(null)} />
    </>
  );
}
