"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useRouter } from "@/i18n/navigation";
import { deleteEnsemble } from "@/lib/actions/ensembles";
import type { Locale } from "@/i18n/routing";

/**
 * Supprimer un ensemble. Rouge, parce que sans retour — mais la phrase dit
 * aussi ce qui NE disparaît PAS : les pièces et les commandes.
 */
export function EnsembleDelete({ id, name }: { id: number; name: string }) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <p className="text-muted-foreground text-sm">{t("stock.deleteEnsembleHint")}</p>
      <Button
        type="button"
        variant="destructive"
        onClick={() => setOpen(true)}
        className="mt-3 h-11 w-full"
      >
        <Trash2 className="size-4" aria-hidden />
        {t("stock.deleteEnsemble")}
      </Button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        tone="danger"
        icon={<Trash2 className="size-4" />}
        title={t("stock.deleteEnsembleConfirmTitle", { name })}
        description={t("stock.deleteEnsembleHint")}
        confirmLabel={t("stock.deleteEnsemble")}
        onConfirm={async () => {
          const data = new FormData();
          data.set("id", String(id));
          data.set("locale", locale);
          const result = await deleteEnsemble(data);
          if (result.ok) router.push("/stock/ensembles");
          return result;
        }}
      />
    </>
  );
}
