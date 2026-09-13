"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertCircle, Check } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { setOrderChecks } from "@/lib/actions/orders";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/routing";

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
  pickedUp,
  returned,
}: {
  orderId: number;
  pickedUp: boolean;
  returned: boolean;
}) {
  const t = useTranslations();

  return (
    <div className="space-y-2">
      <CheckRow
        orderId={orderId}
        field="picked_up"
        checked={pickedUp}
        label={t("orders.pickedUp")}
      />
      <CheckRow
        orderId={orderId}
        field="returned"
        checked={returned}
        label={t("orders.returned")}
      />
    </div>
  );
}

function CheckRow({
  orderId,
  field,
  checked,
  label,
}: {
  orderId: number;
  field: "picked_up" | "returned";
  checked: boolean;
  label: string;
}) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  /**
   * `useOptimistic` et non un `useState` : la coche doit répondre au doigt
   * sans attendre le serveur, mais revenir d'elle-même à la vérité de la base
   * quand la transition se termine — y compris si l'écriture a échoué. Un
   * `useState` resterait figé sur un mensonge.
   */
  const [shown, setShown] = useOptimistic(checked);

  function toggle() {
    setError(null);
    const next = !checked;

    const data = new FormData();
    data.set("id", String(orderId));
    data.set("locale", locale);
    data.set("field", field);
    data.set("value", next ? "1" : "0");

    startTransition(async () => {
      setShown(next);
      const result = await setOrderChecks(data);
      if (!result.ok) setError(result.error);
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
          "flex min-h-14 w-full items-center gap-3 rounded-lg border px-4 py-3 text-start transition-colors",
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
