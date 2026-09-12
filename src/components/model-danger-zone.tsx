"use client";

import { useState, useTransition } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertCircle, ArchiveRestore, PackageX, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Spinner } from "@/components/ui/spinner";
import { useRouter } from "@/i18n/navigation";
import { deleteModel, setModelActive } from "@/lib/actions/stock";
import type { Locale } from "@/i18n/routing";

type Props = {
  modelId: number;
  name: string;
  pieceCount: number;
  /** Une pièce au moins figure dans une commande — passée ou en cours. */
  hasHistory: boolean;
  isActive: boolean;
};

/**
 * Se débarrasser d'un modèle — deux gestes, jamais présentés ensemble.
 *
 * Un modèle sans la moindre commande est une erreur de saisie : il s'efface,
 * ses pièces avec. Un modèle qui a déjà été loué ne s'efface PAS — le costume
 * vendu figure dans des commandes qui font le chiffre d'affaires de l'an
 * dernier. On le RETIRE du catalogue : il disparaît du stock et de la saisie
 * de commande, les comptes ne bougent pas, et le geste se défait.
 *
 * L'écran ne propose donc que celui des deux qui s'applique, avec la phrase
 * qui l'explique. Proposer « Supprimer » puis refuser au clic apprendrait à
 * l'utilisateur que le bouton ment.
 *
 * La confirmation est un `Drawer`, pas un `window.confirm` : il faut la place
 * de dire ce qui va disparaître, et une cible de 44 px sous le pouce. Voir
 * `daydream-ui`.
 */
export function ModelDangerZone({
  modelId,
  name,
  pieceCount,
  hasHistory,
  isActive,
}: Props) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Retiré du catalogue ET porteur d'un historique : il n'y a plus rien à
  // faire ici. On le dit, plutôt que de laisser un bouton sans effet.
  if (hasHistory && !isActive) {
    return (
      <p className="text-muted-foreground text-sm">{t("stock.archivedAndUsed")}</p>
    );
  }

  const mode = hasHistory ? "archive" : "delete";

  function onConfirm() {
    setError(null);
    const data = new FormData();
    data.set("id", String(modelId));
    data.set("locale", locale);

    startTransition(async () => {
      if (mode === "archive") data.set("active", "0");
      const result = await (mode === "archive" ? setModelActive : deleteModel)(data);
      // La suppression redirige d'elle-même : on n'arrive ici qu'en cas
      // d'échec, ou après un retrait réussi.
      if (result?.ok) {
        setOpen(false);
        // Le modèle vient de quitter le catalogue : rester sur sa page de
        // modification laisserait douter que le geste ait pris. On revient là
        // où son absence se constate.
        router.push("/stock");
        return;
      }
      if (result) setError(result.error);
    });
  }

  return (
    <>
      <p className="text-muted-foreground text-sm">
        {mode === "archive"
          ? t("stock.archiveModelHint")
          : t("stock.deleteModelHint", { count: pieceCount })}
      </p>

      <Button
        type="button"
        variant={mode === "archive" ? "outline" : "destructive"}
        onClick={() => setOpen(true)}
        className="mt-3 h-11 w-full"
      >
        {mode === "archive" ? (
          <PackageX className="size-4" aria-hidden />
        ) : (
          <Trash2 className="size-4" aria-hidden />
        )}
        {mode === "archive" ? t("stock.archiveModel") : t("stock.deleteModel")}
      </Button>

      {error && (
        <Alert variant="destructive" className="mt-3">
          <AlertCircle />
          <AlertDescription>{t(error)}</AlertDescription>
        </Alert>
      )}

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader className="text-start">
            <DrawerTitle>
              {mode === "archive"
                ? t("stock.archiveConfirmTitle", { name })
                : t("stock.deleteConfirmTitle", { name })}
            </DrawerTitle>
            <DrawerDescription>
              {mode === "archive"
                ? t("stock.archiveConfirmBody")
                : t("stock.deleteConfirmBody", { count: pieceCount })}
            </DrawerDescription>
          </DrawerHeader>

          <DrawerFooter>
            <Button
              type="button"
              variant={mode === "archive" ? "default" : "destructive"}
              disabled={isPending}
              onClick={onConfirm}
              className="h-12 w-full text-base"
            >
              {isPending && <Spinner />}
              {mode === "archive" ? t("stock.archiveModel") : t("stock.deleteModel")}
            </Button>
            <DrawerClose asChild>
              <Button type="button" variant="ghost" className="h-12 w-full text-base">
                {t("common.cancel")}
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}

/**
 * Remettre au catalogue — le geste inverse du retrait.
 *
 * Sans confirmation : rien ne se perd, et refuser un aller sans retour est
 * précisément ce qui rend le retrait acceptable.
 */
export function ModelRestoreButton({ modelId }: { modelId: number }) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="secondary"
      disabled={isPending}
      onClick={() => {
        const data = new FormData();
        data.set("id", String(modelId));
        data.set("locale", locale);
        data.set("active", "1");
        startTransition(async () => {
          await setModelActive(data);
        });
      }}
      className="h-11 shrink-0"
    >
      {isPending ? <Spinner /> : <ArchiveRestore className="size-4" aria-hidden />}
      {t("stock.restoreModel")}
    </Button>
  );
}
