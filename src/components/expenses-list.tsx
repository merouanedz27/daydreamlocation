"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { sheet } from "@/components/sheet-table";
import { Link } from "@/i18n/navigation";
import { deleteExpense } from "@/lib/actions/expenses";
import {
  CURRENCY_SUFFIX,
  formatDate,
  formatDayMonth,
  formatMoney,
  formatNumber,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { Highlight } from "@/components/highlight";
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
 * Registre des dépenses, en tableau « façon tableur » — le même que celui des
 * commandes et du stock (`sheet`), sans défilement horizontal.
 *
 * Colonnes : Date · Description · Catégorie · Commande · Montant (DA) · corbeille.
 *
 * Sur téléphone (< 640 px), Catégorie et Commande quittent leurs colonnes pour
 * une seconde ligne, en petit, sous la description : quatre colonnes tiennent
 * à 390 px, et rien ne disparaît. Au-delà, chacune retrouve sa colonne.
 *
 * - **Jour et mois seulement**, pas l'année : le navigateur de mois au-dessus
 *   dit déjà « Septembre 2026 ».
 * - **Montant nu**, la devise est dans l'en-tête : la colonne s'aligne et se
 *   parcourt comme dans le tableur.
 * - La hauteur de ligne est dictée par la corbeille : 44 px de cible tactile.
 *   La réduire ferait déborder sa zone sur la corbeille voisine — un risque
 *   d'effacement au mauvais endroit qu'on ne prend pas.
 * - Pas de fiche détail : la ligne n'est pas cliquable (curseur normal).
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
      <div className={cn(sheet.wrapper, "mt-3")}>
        <table className={sheet.table}>
          <thead>
            <tr className={sheet.headRow}>
              <th scope="col" className={cn(sheet.th, "text-start")}>
                <span className={sheet.thInner}>{t("expenses.date")}</span>
              </th>
              <th scope="col" className={cn(sheet.th, "text-start")}>
                <span className={sheet.thInner}>{t("expenses.description")}</span>
              </th>
              <th scope="col" className={cn(sheet.th, "hidden text-start sm:table-cell")}>
                <span className={sheet.thInner}>{t("expenses.category")}</span>
              </th>
              <th scope="col" className={cn(sheet.th, "hidden text-start sm:table-cell")}>
                <span className={sheet.thInner}>{t("expenses.short.order")}</span>
              </th>
              <th scope="col" className={cn(sheet.th, "text-end")}>
                <span className={cn(sheet.thInner, "justify-end")}>
                  {t("orders.withCurrency", {
                    label: t("expenses.amount"),
                    currency: CURRENCY_SUFFIX[locale],
                  })}
                </span>
              </th>
              <th scope="col" className={cn(sheet.th, "w-px")}>
                <span className="sr-only">{t("common.delete")}</span>
              </th>
            </tr>
          </thead>

          <tbody>
            {expenses.map((e) => {
              const category = t(`expenses.categories.${e.category}`);
              // Une dépense rattachée à une commande, c'est « Les frais » du
              // tableur : on garde le lien vers la commande concernée.
              const order = e.orders && (
                <Link
                  href={`/commandes/${e.order_id}`}
                  className="text-gold-strong underline-offset-4 hover:underline"
                >
                  <bdi className="whitespace-nowrap">
                    <Highlight text={e.orders.order_no} />
                  </bdi>{" "}
                  <span className="wrap-anywhere">
                    <Highlight text={e.orders.customer_name} />
                  </span>
                </Link>
              );

              return (
                <tr key={e.id} className={cn(sheet.row, "cursor-auto")}>
                  <td
                    className={cn(
                      sheet.td,
                      "text-muted-foreground tabular text-start whitespace-nowrap",
                    )}
                  >
                    {formatDayMonth(e.spent_on, locale)}
                  </td>

                  {/* Le libellé saisi porte l'information ; à défaut, la
                      catégorie prend sa place — jamais de ligne sans titre. */}
                  <td className={cn(sheet.td, "text-start")}>
                    <span className="block min-w-14 wrap-anywhere">
                      <Highlight text={e.description || category} />
                    </span>

                    {/* Téléphone : catégorie et commande en seconde ligne. La
                        catégorie ne se répète pas quand elle sert déjà de titre. */}
                    {(e.description || order) && (
                      <span className="text-muted-foreground mt-0.5 block text-xs sm:hidden">
                        {e.description && category}
                        {e.description && order && <Dot />}
                        {order}
                      </span>
                    )}
                  </td>

                  <td
                    className={cn(
                      sheet.td,
                      "text-muted-foreground hidden text-start sm:table-cell",
                    )}
                  >
                    {category}
                  </td>

                  <td className={cn(sheet.td, "hidden text-start sm:table-cell")}>
                    {order ?? <span className="text-muted-foreground">—</span>}
                  </td>

                  <td className={cn(sheet.td, "tabular text-end font-medium whitespace-nowrap")}>
                    {formatNumber(e.amount, locale)}
                  </td>

                  <td className={cn(sheet.td, "w-px p-0 sm:p-0 md:p-0")}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setToDelete(e);
                        setConfirmOpen(true);
                      }}
                      className="text-muted-foreground hover:text-destructive size-11"
                    >
                      <Trash2 className="size-4" aria-hidden />
                      {/* Le nom accessible porte la dépense visée : trente
                          « Supprimer » identiques ne se distinguent pas au
                          lecteur d'écran. */}
                      <span className="sr-only">
                        {t("expenses.deleteThis", {
                          label: e.description || category,
                        })}
                      </span>
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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
