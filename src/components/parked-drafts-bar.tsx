"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { PauseCircle, X } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { discard, filledCount, type ParkedDraft } from "@/lib/parked-drafts";
import { formatDate, formatNumber } from "@/lib/format";
import type { Locale } from "@/i18n/routing";

/**
 * Les clients EN ATTENTE, en haut de la saisie : une puce par client, dans
 * l'ordre d'arrivée. Toucher une puce reprend le client ; la croix le retire.
 *
 * Une seule rangée qui défile au pouce : la saisie en dessous ne bouge pas,
 * qu'il y ait un client en attente ou cinq.
 */
export function ParkedDraftsBar({
  parked,
  onResume,
  onDiscard,
}: {
  parked: ParkedDraft[];
  onResume: (id: string) => void;
  onDiscard: (item: ParkedDraft) => void;
}) {
  const t = useTranslations("orders.parked");
  const { locale } = useParams<{ locale: Locale }>();
  if (parked.length === 0) return null;

  return (
    <nav aria-label={t("barLabel")} className="-mx-4 mb-4">
      <ul className="flex gap-2 overflow-x-auto px-4 pb-1">
        {parked.map((item) => {
          const name = item.draft.customerName.trim();
          const count = filledCount(item.draft);
          return (
            <li
              key={item.id}
              className="border-gold-strong/40 bg-gold-soft flex shrink-0 items-center rounded-full border"
            >
              <button
                type="button"
                onClick={() => onResume(item.id)}
                aria-label={t("resume", { name })}
                className="focus-visible:ring-ring flex min-h-11 items-center gap-1.5 rounded-full ps-3 pe-1 text-sm focus-visible:ring-2 focus-visible:outline-none"
              >
                <PauseCircle className="text-gold-strong size-4 shrink-0" aria-hidden />
                <span className="max-w-32 truncate font-medium">{name}</span>
                <span className="text-muted-foreground whitespace-nowrap">
                  · {t("pieces", { count, n: formatNumber(count, locale) })}
                  {item.draft.eventDate && ` · ${formatDate(item.draft.eventDate, locale)}`}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onDiscard(item)}
                aria-label={t("discard", { name })}
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex size-11 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:outline-none"
              >
                <X className="size-4" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * « Retirer X de l'attente ? » — la même question sur la saisie et sur la page
 * « En attente ». `item` à `null` : fermée.
 */
export function ParkedDiscardDialog({
  item,
  onClose,
}: {
  item: ParkedDraft | null;
  onClose: () => void;
}) {
  const t = useTranslations("orders.parked");
  return (
    <ConfirmDialog
      open={item !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      icon={<X className="size-4" />}
      title={t("discardTitle", { name: item?.draft.customerName.trim() ?? "" })}
      description={t("discardBody")}
      confirmLabel={t("discardConfirm")}
      onConfirm={async () => {
        if (item) discard(item.id);
      }}
    />
  );
}
