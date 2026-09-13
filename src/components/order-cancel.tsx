"use client";

import { useState, useTransition } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertCircle, Ban, RotateCcw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Spinner } from "@/components/ui/spinner";
import { setOrderCancelled } from "@/lib/actions/orders";
import { formatNumber } from "@/lib/format";
import type { Locale } from "@/i18n/routing";

/**
 * Annuler une commande — le seul geste qui LIBÈRE des pièces.
 *
 * Il fallait le distinguer de la suppression, et l'écran doit le dire : rien
 * n'est effacé. La commande reste dans le registre, ses lignes avec ; elle
 * quitte simplement le chiffre d'affaires et rend ses dates au stock. C'est
 * pourquoi le bouton est `destructive` mais le titre de section ne l'est pas :
 * le geste se défait, contrairement à la suppression d'un modèle.
 *
 * La confirmation passe par `ConfirmDialog`, commun à tout le produit : il
 * faut la place d'annoncer combien de pièces se libèrent, et une cible de
 * 44 px sous le pouce. Voir `daydream-ui`.
 */
export function OrderCancelZone({
  orderId,
  customerName,
  unitCount,
}: {
  orderId: number;
  customerName: string;
  /**
   * Pièces DU STOCK que l'annulation va libérer. Une commande entièrement
   * sous-louée chez un confrère en compte zéro : promettre « 0 pièce
   * redevient disponible » serait absurde, la confirmation change de phrase.
   */
  unitCount: number;
}) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const [open, setOpen] = useState(false);

  return (
    <>
      <p className="text-muted-foreground text-sm">{t("orders.cancelHint")}</p>

      <Button
        type="button"
        variant="destructive"
        onClick={() => setOpen(true)}
        className="mt-3 h-11 w-full sm:w-auto"
      >
        <Ban className="size-4" aria-hidden />
        {t("orders.cancelOrder")}
      </Button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        icon={<Ban className="size-4" />}
        title={t("orders.cancelConfirmTitle", { name: customerName })}
        description={
          unitCount > 0
            ? t("orders.cancelConfirmBody", {
                count: formatNumber(unitCount, locale),
              })
            : t("orders.cancelConfirmBodyNoUnit")
        }
        confirmLabel={t("orders.cancelOrder")}
        // « Annuler » tout court serait ici la pire des étiquettes : elle
        // dirait le contraire de ce qu'elle fait.
        cancelLabel={t("orders.keepOrder")}
        onConfirm={async () => {
          const data = new FormData();
          data.set("id", String(orderId));
          data.set("locale", locale);
          data.set("cancelled", "1");
          return await setOrderCancelled(data);
        }}
      />
    </>
  );
}

/**
 * Remettre une commande annulée en service — le geste inverse.
 *
 * Sans confirmation : rien ne se perd. Mais il peut ÉCHOUER, et c'est tout
 * l'intérêt — la remise en service repasse les pièces par la contrainte
 * d'exclusion. Si la veste est repartie sur un autre mariage entre-temps,
 * Postgres refuse et la fonction SQL nomme la pièce en cause. D'où l'alerte
 * ici : ce message est le seul moyen pour l'employé de comprendre pourquoi.
 */
export function OrderRestoreButton({ orderId }: { orderId: number }) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="min-w-0">
      <Button
        type="button"
        variant="secondary"
        disabled={isPending}
        onClick={() => {
          setError(null);
          const data = new FormData();
          data.set("id", String(orderId));
          data.set("locale", locale);
          data.set("cancelled", "0");
          startTransition(async () => {
            const result = await setOrderCancelled(data);
            if (!result.ok) setError(result.error);
          });
        }}
        className="h-11 w-full shrink-0 sm:w-auto"
      >
        {isPending ? <Spinner /> : <RotateCcw className="size-4" aria-hidden />}
        {t("orders.restoreOrder")}
      </Button>

      {error && (
        <Alert variant="destructive" className="mt-3">
          <AlertCircle />
          <AlertDescription>{t(error)}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
