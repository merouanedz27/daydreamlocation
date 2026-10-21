"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Check } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { sendOrQueue } from "@/lib/offline/outbox";
import { useOutbox } from "@/components/offline-sync";
import { cn } from "@/lib/utils";

/**
 * « Aller validé » / « Retour validé » — le geste du patron, tel quel.
 *
 * Deux cases, et le statut de la commande s'en déduit en base. On ne propose
 * surtout PAS de sélecteur de statut : il permettrait d'écrire « retournée »
 * sans avoir constaté le retour, et demanderait d'apprendre un vocabulaire là
 * où deux coches suffisent.
 *
 * Des boutons à bascule (`aria-pressed`) plutôt que des cases de formulaire :
 * chaque clic ENREGISTRE. Une vraie case à cocher promettrait un bouton
 * « Enregistrer » qui n'existe pas.
 */
export function OrderChecks({
  orderId,
  name,
  pickedUp,
  returned,
}: {
  orderId: number;
  /** Le client : nomme le geste s'il attend dans la file hors ligne. */
  name: string;
  pickedUp: boolean;
  returned: boolean;
}) {
  const t = useTranslations();

  return (
    <div className="space-y-2">
      <CheckRow
        orderId={orderId}
        name={name}
        field="picked_up"
        checked={pickedUp}
        label={t("orders.pickedUp")}
      />
      <CheckRow
        orderId={orderId}
        name={name}
        field="returned"
        checked={returned}
        label={t("orders.returned")}
      />
    </div>
  );
}

function CheckRow({
  orderId,
  name,
  field,
  checked,
  label,
}: {
  orderId: number;
  name: string;
  field: "picked_up" | "returned";
  checked: boolean;
  label: string;
}) {
  const t = useTranslations();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  /**
   * `useOptimistic` et non un `useState` : la coche doit répondre au doigt
   * sans attendre le serveur, mais revenir d'elle-même à la vérité de la base
   * quand la transition se termine — y compris si l'écriture a échoué. Un
   * `useState` resterait figé sur un mensonge.
   */
  const [optimistic, setOptimistic] = useOptimistic(checked);
  // Gardé dans la file hors ligne : coché à l'écran, pas encore en base.
  const [queued, setQueued] = useState<boolean | null>(null);
  if (queued !== null && queued === checked) setQueued(null);
  // Écran resservi sans réseau : la coche en file se voit quand même.
  const outbox = useOutbox();
  let inQueue: boolean | null = null;
  for (const item of outbox) {
    const op = item.op;
    if (item.status === "pending" && op.kind === "check" && op.orderId === orderId && op.field === field) {
      inQueue = op.value;
    }
  }
  const waiting = queued ?? inQueue;
  const shown = isPending ? optimistic : (waiting ?? optimistic);

  function toggle() {
    setError(null);
    const next = !shown;

    startTransition(async () => {
      setOptimistic(next);
      const result = await sendOrQueue({ kind: "check", orderId, field, value: next }, `${label} — ${name}`);
      if (!result.ok) setError(result.error);
      else if (result.queued) setQueued(next);
    });
  }

  return (
    <div>
      <button
        type="button"
        role="switch"
        aria-checked={shown}
        disabled={isPending}
        onClick={toggle}
        className={cn(
          "press flex min-h-14 w-full items-center gap-3 rounded-lg border px-4 py-3 text-start [--press-scale:0.98]",
          "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
          shown
            ? "border-gold-strong bg-gold-soft"
            : "border-border bg-card hover:border-gold-strong",
        )}
      >
        {/* La pastille porte le jaune vif en REMPLISSAGE, et son signe en
            encre : du blanc sur ce jaune ne vaudrait que 1,84:1. */}
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-md border",
            shown
              ? "bg-primary text-primary-foreground border-transparent"
              : "border-border bg-background",
          )}
          aria-hidden
        >
          {isPending ? <Spinner className="size-4" /> : shown && <Check className="size-4" />}
        </span>

        <span className={cn("flex-1 text-sm", shown && "font-medium")}>{label}</span>
      </button>

      {error && (
        <Alert variant="destructive" className="mt-2">
          <AlertCircle />
          <AlertDescription>{t(error)}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
