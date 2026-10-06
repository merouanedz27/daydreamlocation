"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { deleteSet } from "@/lib/actions/stock";
import type { Locale } from "@/i18n/routing";

/**
 * Supprime un COSTUME entier — toutes ses parties — saisi par erreur. Une
 * partie abîmée seule se supprime depuis son crayon (`UnitEdit`).
 */
export function SetDelete({ modelId, setRef }: { modelId: number; setRef: string }) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const [open, setOpen] = useState(false);

  async function onConfirm() {
    const data = new FormData();
    data.set("locale", locale);
    data.set("model_id", String(modelId));
    data.set("set_ref", setRef);
    const result = await deleteSet(data);
    if (!result.ok) return result;
    toast.success(
      t(result.retired ? "stock.pieceRetiredToast" : "stock.pieceDeletedToast", { ref: setRef }),
    );
    return result;
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-muted-foreground hover:text-destructive size-11 shrink-0"
        onClick={() => setOpen(true)}
        aria-label={t("stock.parts.deleteSetNamed", { ref: setRef })}
      >
        <Trash2 className="size-4" aria-hidden />
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        icon={<Trash2 className="size-4" />}
        title={t("stock.deletePieceTitle", { ref: setRef })}
        description={t("stock.parts.deleteSetBody")}
        confirmLabel={t("common.delete")}
        onConfirm={onConfirm}
      />
    </>
  );
}
