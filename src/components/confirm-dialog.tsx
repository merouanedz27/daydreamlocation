"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Spinner } from "@/components/ui/spinner";

/**
 * Ce que rend une action confirmée. `void` couvre les Server Actions qui
 * redirigent : elles ne rendent jamais la main, et ne rien rendre vaut
 * réussite.
 */
export type ConfirmOutcome = void | { ok: boolean; error?: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** La question. Nomme CE QUI est visé, jamais « cet élément ». */
  title: React.ReactNode;
  /** La conséquence. Ce qu'on ne pourra plus faire après. */
  description?: React.ReactNode;
  /** Le verbe du geste — « Supprimer », « Annuler la commande ». Jamais « OK ». */
  confirmLabel: string;
  /** Par défaut « Annuler ». À remplacer quand « Annuler » serait ambigu. */
  cancelLabel?: string;
  /**
   * `danger` pour ce qui détruit ou retire, `default` pour ce qui se refait
   * (la déconnexion). Le rouge partout ne veut plus rien dire nulle part.
   */
  tone?: "danger" | "default";
  icon?: React.ReactNode;
  onConfirm: () => Promise<ConfirmOutcome>;
};

/**
 * La demande de confirmation du produit — une seule, pour tous les gestes qui
 * ne se rattrapent pas.
 *
 * Elle remplace trois façons de faire qui coexistaient : deux tiroirs écrits à
 * la main (annulation de commande, suppression de modèle) et un
 * `window.confirm` (suppression de dépense). Trois comportements différents
 * pour un même geste, c'est trois occasions de se tromper.
 *
 * POURQUOI PAS `window.confirm`
 *
 * Il n'est pas traduisible autrement qu'en une phrase sèche, il ignore le sens
 * de lecture arabe, il affiche l'URL du site au-dessus de la question, et sur
 * téléphone son bouton « OK » fait moins de 44 px. Surtout : il ne peut porter
 * qu'une phrase. Impossible d'y écrire « 1 500 DA du 05/12 » — or c'est
 * exactement ce qui permet de reconnaître la ligne qu'on s'apprête à effacer.
 *
 * CE QUE LE COMPOSANT PREND EN CHARGE, ET POURQUOI
 *
 * 1. **L'erreur s'affiche DANS le tiroir.** Les deux tiroirs écrits à la main
 *    posaient leur alerte dans la page, sous l'ombre du tiroir resté ouvert :
 *    le message existait dans le DOM, personne ne pouvait le lire. C'est le
 *    seul endroit où l'on apprend qu'une remise en service a échoué parce
 *    qu'une pièce est repartie sur un autre mariage.
 * 2. **Rien ne ferme le tiroir pendant l'attente** — ni le voile, ni Échap, ni
 *    le glissement vers le bas. Le geste touche de l'argent ou du stock ;
 *    fermer en cours laisserait croire qu'il n'a pas eu lieu.
 * 3. **Le clavier arrive sur « Annuler »**, pas sur le bouton rouge. Ouvrir
 *    puis appuyer sur Entrée par réflexe ne doit rien détruire.
 * 4. **L'erreur se vide à la réouverture.** Sinon l'échec d'hier accueille le
 *    geste d'aujourd'hui.
 *
 * Tiroir et non boîte centrée : l'équipe travaille au pouce (`daydream-ui`).
 * Le bouton d'action est EN HAUT et « Annuler » en bas — dans une feuille qui
 * monte du bas de l'écran, le pouce au repos tombe sur le bas. C'est donc le
 * geste sûr qui se trouve sous le doigt.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = "danger",
  icon,
  onConfirm,
}: Props) {
  const t = useTranslations();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // L'échec précédent ne doit pas accueillir la demande suivante.
  //
  // Ajustement PENDANT le rendu, et non dans un effet : c'est le motif
  // documenté par React pour réagir au changement d'une prop. Le même code en
  // `useEffect` afficherait l'erreur périmée le temps d'une image, et ESLint
  // le refuse (`react-hooks/set-state-in-effect`).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && error) setError(null);
  }

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const outcome = await onConfirm();
      // Pas de retour = Server Action qui redirige : le geste a abouti.
      if (!outcome || outcome.ok) {
        onOpenChange(false);
        return;
      }
      setError(outcome.error ?? "errors.generic");
    });
  }

  return (
    <Drawer
      open={open}
      // Pendant l'attente, le tiroir ne se ferme plus : ni voile, ni Échap,
      // ni glissement. Il se rouvrirait sur un état qu'on ne saurait plus lire.
      dismissible={!isPending}
      onOpenChange={(next) => {
        if (isPending && !next) return;
        onOpenChange(next);
      }}
    >
      <DrawerContent
        onEscapeKeyDown={(e) => {
          if (isPending) e.preventDefault();
        }}
        // Le focus d'ouverture irait au premier bouton du pied, donc au bouton
        // rouge. On le pose sur le geste qui ne casse rien.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          cancelRef.current?.focus();
        }}
      >
        <DrawerHeader className="text-start">
          <DrawerTitle className="flex items-start gap-2">
            {icon && (
              <span
                className={
                  tone === "danger"
                    ? "text-destructive mt-0.5 shrink-0"
                    : "text-gold-strong mt-0.5 shrink-0"
                }
                aria-hidden
              >
                {icon}
              </span>
            )}
            <span className="min-w-0">{title}</span>
          </DrawerTitle>
          {description && <DrawerDescription>{description}</DrawerDescription>}
        </DrawerHeader>

        {/* L'alerte vit ICI, au-dessus des boutons : c'est le seul endroit du
            tiroir que l'utilisateur regarde déjà. */}
        {error && (
          <div className="px-4">
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{t(error)}</AlertDescription>
            </Alert>
          </div>
        )}

        <DrawerFooter>
          <Button
            type="button"
            variant={tone === "danger" ? "destructive" : "default"}
            disabled={isPending}
            onClick={handleConfirm}
            className="h-12 w-full text-base"
          >
            {isPending && <Spinner />}
            {confirmLabel}
          </Button>

          {/* Pas de `DrawerClose` : il fermerait le tiroir même en pleine
              attente, en court-circuitant la garde ci-dessus. */}
          <Button
            ref={cancelRef}
            type="button"
            variant="ghost"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
            className="h-12 w-full text-base"
          >
            {cancelLabel ?? t("common.cancel")}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
