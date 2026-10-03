"use client";

import { useState, useTransition } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Spinner } from "@/components/ui/spinner";
import { removeModel, setModelActive } from "@/lib/actions/stock";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

export type MenuModel = { id: number; name: string; ref: string };

/**
 * Le menu de l'APPUI LONG sur un modèle du catalogue (administrateur) :
 * modifier, ajouter une pièce, retirer du catalogue (ou l'y remettre), et
 * supprimer — après confirmation.
 *
 * « Supprimer » efface un modèle jamais loué ; un modèle déjà loué est RETIRÉ
 * à la place (`removeModel`) : ses commandes passées le désignent encore. La
 * confirmation le dit avant, le message de fin dit ce qui a eu lieu.
 */
export function StockModelMenu({
  model,
  archived,
  onClose,
}: {
  /** `null` = menu fermé. */
  model: MenuModel | null;
  archived: boolean;
  onClose: () => void;
}) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  // Le dernier modèle ouvert reste affiché pendant l'animation de fermeture.
  const [shown, setShown] = useState<MenuModel | null>(model);
  if (model && model !== shown) setShown(model);

  const payload = (target: MenuModel, extra: Record<string, string> = {}) => {
    const data = new FormData();
    data.set("locale", locale);
    data.set("id", String(target.id));
    for (const [k, v] of Object.entries(extra)) data.set(k, v);
    return data;
  };

  function toggleArchive() {
    if (!shown) return;
    const target = shown;
    startTransition(async () => {
      const result = await setModelActive(payload(target, { active: archived ? "1" : "0" }));
      if (!result.ok) {
        toast.error(t(result.error));
        return;
      }
      toast.success(
        t(archived ? "stock.restoredToast" : "stock.archivedToast", { name: target.name }),
      );
      onClose();
    });
  }

  async function remove() {
    if (!shown) return;
    const target = shown;
    const result = await removeModel(payload(target));
    if (!result.ok) return result;
    toast.success(
      t(result.retired ? "stock.retiredInsteadToast" : "stock.deletedToast", {
        name: target.name,
      }),
    );
    onClose();
    return result;
  }

  return (
    <>
      <Drawer open={!!model && !confirming} onOpenChange={(open) => !open && onClose()}>
        <DrawerContent>
          <DrawerHeader className="text-start">
            <DrawerTitle className="truncate">{shown?.name}</DrawerTitle>
            <DrawerDescription>
              <bdi>{shown?.ref}</bdi>
            </DrawerDescription>
          </DrawerHeader>

          {shown && (
            <div className="grid gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <Button asChild variant="outline" className="h-12 justify-start text-base">
                <Link href={`/stock/${shown.id}/modifier`}>
                  <Pencil className="size-4" aria-hidden />
                  {t("stock.editModel")}
                </Link>
              </Button>
              {!archived && (
                <Button asChild variant="outline" className="h-12 justify-start text-base">
                  <Link href={`/stock/${shown.id}/piece`}>
                    <Plus className="size-4" aria-hidden />
                    {t("stock.addPiece")}
                  </Link>
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={toggleArchive}
                disabled={pending}
                className="h-12 justify-start text-base"
              >
                {pending ? (
                  <Spinner />
                ) : archived ? (
                  <ArchiveRestore className="size-4" aria-hidden />
                ) : (
                  <Archive className="size-4" aria-hidden />
                )}
                {t(archived ? "stock.restoreModel" : "stock.archiveModel")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => setConfirming(true)}
                disabled={pending}
                className="h-12 justify-start text-base"
              >
                <Trash2 className="size-4" aria-hidden />
                {t("common.delete")}
              </Button>
            </div>
          )}
        </DrawerContent>
      </Drawer>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("stock.deleteConfirmTitle", { name: shown?.name ?? "" })}
        description={t("stock.holdDeleteBody")}
        confirmLabel={t("common.delete")}
        tone="danger"
        onConfirm={remove}
      />
    </>
  );
}
