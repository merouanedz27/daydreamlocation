"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { deleteOrder } from "@/lib/actions/orders";
import { formatNumber } from "@/lib/format";
import type { Locale } from "@/i18n/routing";

/**
 * Supprimer une commande — propriétaire uniquement, et sans retour.
 *
 * Posée SOUS l'annulation, jamais à sa place : pour un mariage reporté,
 * l'annulation suffit et se défait. Le texte d'aide le rappelle, pour que le
 * rouge définitif ne devienne pas le réflexe.
 *
 * La confirmation nomme le client ET le numéro de commande : deux commandes
 * au même nom (le frère, le cousin) sont courantes, et c'est le numéro qui
 * permet de s'assurer qu'on efface la bonne.
 */
export function OrderDeleteZone({
  orderId,
  orderNo,
  customerName,
  expenseCount,
}: {
  orderId: number;
  orderNo: string;
  customerName: string;
  /** Frais rattachés : ils restent dans les dépenses, détachés. */
  expenseCount: number;
}) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const [open, setOpen] = useState(false);

  return (
    <>
      <p className="text-muted-foreground text-sm">{t("orders.deleteHint")}</p>

      <Button
        type="button"
        variant="destructive"
        onClick={() => setOpen(true)}
        className="mt-3 h-11 w-full sm:w-auto"
      >
        <Trash2 className="size-4" aria-hidden />
        {t("orders.deleteOrder")}
      </Button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        icon={<Trash2 className="size-4" />}
        title={t("orders.deleteConfirmTitle", { name: customerName })}
        description={
          <>
            {/* Le numéro est un code latin : isolé, sinon l'ordre se brise
                dans une phrase arabe. */}
            {t.rich("orders.deleteConfirmBody", {
              orderNo,
              no: (chunks) => <bdi className="text-foreground font-medium">{chunks}</bdi>,
            })}
            {expenseCount > 0 && (
              <>
                {" "}
                {t("orders.deleteConfirmExpenses", {
                  count: formatNumber(expenseCount, locale),
                })}
              </>
            )}
          </>
        }
        confirmLabel={t("orders.deleteOrder")}
        cancelLabel={t("orders.keepOrder")}
        onConfirm={async () => {
          const data = new FormData();
          data.set("id", String(orderId));
          data.set("locale", locale);
          // Réussite = redirection vers la liste : l'action ne rend la main
          // qu'en cas d'échec, que le tiroir affiche alors.
          return await deleteOrder(data);
        }}
      />
    </>
  );
}
