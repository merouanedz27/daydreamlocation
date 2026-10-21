"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertCircle, Clock, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useOutbox } from "@/components/offline-sync";
import { removeOutboxItem } from "@/lib/offline/outbox";
import type { OutboxItem, OutboxOp } from "@/lib/offline/types";

type ProvisionalOp = Extract<OutboxOp, { kind: "order" | "orderEdit" }>;
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/routing";

/** Une saisie de nouvelle commande est-elle en cours dans ce téléphone ? */
function quickDraftInProgress(): boolean {
  try {
    const d = JSON.parse(localStorage.getItem("dd.quickOrder") ?? "null") as {
      customerName?: string;
      slots?: { name?: string }[];
    } | null;
    return Boolean(d && (d.customerName?.trim() || d.slots?.some((s) => s.name?.trim())));
  } catch {
    return false;
  }
}

/**
 * Les commandes PROVISOIRES de ce téléphone — saisies ou modifiées sans
 * réseau, pas encore confirmées par la base.
 *
 * Elles ne sont dans aucune liste du serveur : on les montre ici, en tête,
 * pour que personne ne les oublie ni ne les prenne pour des réservations.
 *
 *   - en attente : « Modifier » la reprend dans le formulaire ;
 *   - refusée    : la raison (« Gio-079-01 déjà louée »), et « Corriger » la
 *                  rouvre, tout rempli, pour choisir une autre pièce.
 */
export function PendingOrders({ locale, userId }: { locale: Locale; userId?: string }) {
  const t = useTranslations();
  const items = useOutbox().filter(
    (i) => (i.op.kind === "order" || i.op.kind === "orderEdit") && (!userId || i.userId === userId),
  );
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="pending-orders" className="mb-4">
      <h2 id="pending-orders" className="text-warning-foreground mb-2 flex items-center gap-1.5 text-sm font-medium">
        <Clock className="size-4" aria-hidden />
        {t("offline.pendingOrdersTitle", { count: items.length })}
      </h2>
      <ul className="space-y-2">
        {items.map((item) => (
          <PendingOrderCard key={item.id} item={item} locale={locale} />
        ))}
      </ul>
    </section>
  );
}

function PendingOrderCard({ item, locale }: { item: OutboxItem; locale: Locale }) {
  const t = useTranslations();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const raw = item.op;
  if (raw.kind !== "order" && raw.kind !== "orderEdit") return null;
  // Lié une fois, déjà restreint : les fonctions ci-dessous gardent le type.
  const op: ProvisionalOp = raw;
  const rejected = item.status === "rejected";

  /** Remet la saisie dans le formulaire et la retire de la file. */
  async function reopen() {
    if (op.kind === "order") {
      if (quickDraftInProgress()) {
        toast.error(t("offline.finishCurrentDraft"));
        return;
      }
      try {
        localStorage.setItem("dd.quickOrder", JSON.stringify(op.draft));
      } catch {
        toast.error(t("errors.generic"));
        return;
      }
      await removeOutboxItem(item.id);
      // Navigation complète : sans réseau, le service worker sert le
      // formulaire hors ligne, qui relit la même saisie.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- navigation COMPLÈTE voulue : sans réseau, seul le service worker peut servir la page hors ligne.
      window.location.assign(`/${locale}/commandes/nouvelle`);
      return;
    }
    try {
      sessionStorage.setItem(`dd.editDraft.${op.orderId}`, JSON.stringify(op.draft));
    } catch {
      toast.error(t("errors.generic"));
      return;
    }
    await removeOutboxItem(item.id);
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- navigation COMPLÈTE voulue : sans réseau, seul le service worker peut servir la page hors ligne.
    window.location.assign(`/${locale}/commandes/${op.orderId}/modifier`);
  }

  return (
    <li
      className={cn(
        "rounded-lg border p-3",
        rejected ? "border-destructive/40 bg-card" : "border-warning-foreground/30 bg-warning-soft",
      )}
    >
      <p className="truncate font-medium">{op.summary.customerName}</p>
      <p className="text-muted-foreground tabular text-xs">
        {op.kind === "orderEdit" ? `${op.orderNo} · ` : ""}
        {t("offline.eventOn", { date: formatDate(`${op.summary.eventDate}T12:00:00+01:00`, locale) })}
      </p>

      <p
        className={cn(
          "mt-2 flex items-start gap-1.5 text-sm",
          rejected ? "text-destructive" : "text-warning-foreground",
        )}
      >
        {rejected ? (
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
        ) : (
          <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
        )}
        <span>
          {rejected
            ? t("offline.rejectedBecause", { reason: t(item.error ?? "errors.generic", item.errorValues) })
            : op.kind === "order"
              ? t("offline.provisional")
              : t("offline.provisionalEdit")}
        </span>
      </p>

      <div className="mt-3 flex gap-2">
        <Button type="button" variant={rejected ? "default" : "outline"} className="h-11 flex-1" onClick={reopen}>
          <Pencil className="size-4" aria-hidden />
          {rejected
            ? op.kind === "order"
              ? t("offline.fix")
              : t("offline.reopenEdit")
            : t("offline.editPending")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="text-muted-foreground h-11"
          onClick={() => setConfirmRemove(true)}
        >
          <Trash2 className="size-4" aria-hidden />
          {t("offline.remove")}
        </Button>
      </div>

      {/* Retirer une commande provisoire, c'est perdre la réservation d'un
          client : on demande. */}
      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={t("offline.removeOrderTitle", { name: op.summary.customerName })}
        description={t("offline.removeOrderBody")}
        confirmLabel={t("offline.remove")}
        cancelLabel={t("common.cancel")}
        onConfirm={async () => {
          await removeOutboxItem(item.id);
          return { ok: true };
        }}
      />
    </li>
  );
}
