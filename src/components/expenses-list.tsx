"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Link } from "@/i18n/navigation";
import { deleteExpense } from "@/lib/actions/expenses";
import { formatDate, formatDayMonth, formatMoney } from "@/lib/format";
import type { ExpenseRow } from "@/lib/queries/expenses";
import type { Locale } from "@/i18n/routing";

/** Point de séparation entre deux miettes de contexte. */
function Dot() {
  return (
    <span aria-hidden className="px-1 opacity-50">
      ·
    </span>
  );
}

/**
 * Registre des dépenses — UNE LIGNE par dépense.
 *
 * Ce n'est ni une carte ni une fiche : c'est un relevé de compte. Trois
 * décisions le rendent aussi court que possible sans rien perdre :
 *
 * 1. **Pas de cadre.** Un bloc encadré et arrondi se lit comme une carte, donc
 *    comme quelque chose de volumineux. Il ne reste que des filets d'un
 *    cheveu entre les lignes — la structure sans l'emballage.
 * 2. **Jour et mois seulement**, pas l'année : l'en-tête au-dessus dit déjà
 *    « Septembre 2026 ». L'année répétée trente fois mangeait un tiers de la
 *    largeur utile d'un téléphone.
 * 3. **Tout sur une ligne** : date à gauche, montant à droite — les deux seules
 *    choses qu'on parcourt du regard, toujours à la même place. Entre les deux,
 *    le libellé puis le contexte (catégorie, commande liée), qui se tronquent
 *    de la fin : ce qui disparaît en premier sur un écran étroit est ce qui
 *    compte le moins.
 *
 * La hauteur est désormais dictée par le SEUL bouton de suppression : 44 px de
 * cible tactile (cf. `daydream-ui`). C'est le plancher, et la ligne s'y tient.
 * Réduire le bouton ferait déborder sa zone tactile sur la ligne voisine, donc
 * sur la corbeille voisine — un risque d'effacement au mauvais endroit qu'on
 * ne prend pas.
 */
export function ExpensesList({ expenses }: { expenses: ExpenseRow[] }) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  // La dépense VISÉE, pas un simple booléen : c'est elle qui donne à la
  // confirmation de quoi se nommer — libellé, montant, date.
  //
  // L'ouverture est un état SÉPARÉ, et la dépense n'est jamais remise à null :
  // le tiroir reste monté le temps de son animation de sortie. L'effacer à la
  // fermeture ferait clignoter « Supprimer «  » ? » pendant ce dernier
  // dixième de seconde. Elle est simplement remplacée à la prochaine ouverture.
  const [toDelete, setToDelete] = useState<ExpenseRow | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!expenses.length) {
    // Un mois vide n'a pas besoin d'une grande boîte en pointillés : une phrase
    // suffit, et le bouton d'ajout est juste au-dessus.
    return (
      <p className="text-muted-foreground border-border mt-3 border-t py-8 text-center text-sm">
        {t("expenses.empty")}
      </p>
    );
  }

  return (
    <>
      <ul className="border-border divide-border mt-3 divide-y border-y">
        {expenses.map((e) => {
          const category = t(`expenses.categories.${e.category}`);
          return (
            <li
              key={e.id}
              className="hover:bg-muted/40 flex items-center gap-2 ps-1"
            >
              <span className="tabular text-muted-foreground w-11 shrink-0 text-center text-xs">
                {formatDayMonth(e.spent_on, locale)}
              </span>

              {/* Une seule ligne qui se tronque : le libellé saisi porte
                l'information ; à défaut, la catégorie prend sa place — jamais
                de ligne sans titre. */}
              <span className="min-w-0 flex-1 truncate text-sm">
                {e.description || category}

                {/* La catégorie ne se répète pas : elle ne revient en gris que
                  lorsqu'un vrai libellé occupe la tête de ligne. */}
                {e.description && (
                  <span className="text-muted-foreground text-xs">
                    <Dot />
                    {category}
                  </span>
                )}

                {/* Une dépense rattachée à une commande, c'est « Les frais » du
                  tableur : on garde le lien vers la commande concernée. */}
                {e.orders && (
                  <span className="text-xs">
                    <span className="text-muted-foreground">
                      <Dot />
                    </span>
                    <Link
                      href={`/commandes/${e.order_id}`}
                      className="text-gold-strong underline-offset-4 hover:underline"
                    >
                      <bdi>{e.orders.order_no}</bdi> {e.orders.customer_name}
                    </Link>
                  </span>
                )}
              </span>

              <span className="tabular shrink-0 text-sm font-medium">
                {formatMoney(e.amount, locale)}
              </span>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => {
                  setToDelete(e);
                  setConfirmOpen(true);
                }}
                className="text-muted-foreground hover:text-destructive size-11 shrink-0"
              >
                <Trash2 className="size-4" aria-hidden />
                {/* Le nom accessible porte la dépense visée : trente
                  « Supprimer » identiques ne se distinguent pas au lecteur
                  d'écran. */}
                <span className="sr-only">
                  {t("expenses.deleteThis", {
                    label: e.description || category,
                  })}
                </span>
              </Button>
            </li>
          );
        })}
      </ul>

      {/* UN SEUL tiroir pour toute la liste, monté en dehors d'elle : trente
          dépenses ne doivent pas monter trente tiroirs.
          Ce que `window.confirm` ne pouvait pas dire, et qui est tout
          l'intérêt : QUELLE dépense, de QUEL montant, de QUELLE date. Un
          registre contient des lignes qui se ressemblent — « Pressing » y
          revient chaque semaine — et la corbeille de la ligne voisine est à
          44 px de celle qu'on visait. */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        icon={<Trash2 className="size-4" />}
        title={t("expenses.deleteConfirmTitle", {
          label: toDelete
            ? toDelete.description ||
              t(`expenses.categories.${toDelete.category}`)
            : "",
        })}
        description={
          toDelete
            ? t("expenses.deleteConfirmBody", {
                amount: formatMoney(toDelete.amount, locale),
                date: formatDate(toDelete.spent_on, locale),
              })
            : undefined
        }
        confirmLabel={t("common.delete")}
        onConfirm={async () => {
          if (!toDelete) return;
          const data = new FormData();
          data.set("id", String(toDelete.id));
          data.set("locale", locale);
          return await deleteExpense(data);
        }}
      />
    </>
  );
}
