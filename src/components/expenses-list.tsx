"use client";

import { useTransition } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Receipt, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { deleteExpense } from "@/lib/actions/expenses";
import { formatDate, formatMoney } from "@/lib/format";
import type { ExpenseRow } from "@/lib/queries/expenses";
import type { Locale } from "@/i18n/routing";

/** Point de séparation entre deux miettes de la ligne secondaire. */
function Dot() {
  return (
    <span aria-hidden className="opacity-60">
      ·
    </span>
  );
}

/**
 * Registre des dépenses — un REGISTRE, pas une pile de fiches.
 *
 * Une dépense tient en quatre miettes (date, catégorie, montant, parfois un
 * libellé). Les présenter en cartes encadrées les étalait sur une centaine de
 * pixels chacune : quatre lignes à l'écran d'un téléphone pour un mois qui en
 * compte trente. On revient donc à ce qu'est vraiment cet écran — une colonne
 * de montants qu'on parcourt du regard :
 *
 * - un seul cadre pour toute la liste, des filets entre les lignes ;
 * - le montant TOUJOURS à la même distance du bord, en chiffres tabulaires,
 *   pour que la colonne s'aligne et se compare d'un coup d'œil ;
 * - deux niveaux seulement : ce que la dépense EST en corps de texte, le
 *   contexte (date, catégorie, commande) en dessous, en gris.
 *
 * La hauteur de ligne reste dictée par le bouton de suppression : 44 px de
 * cible tactile, non négociable (cf. `daydream-ui`). C'est le plancher, et la
 * ligne s'y tient.
 */
export function ExpensesList({ expenses }: { expenses: ExpenseRow[] }) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const [isPending, startTransition] = useTransition();

  if (!expenses.length) {
    return (
      <div className="border-border mt-4 flex flex-col items-center rounded-lg border border-dashed px-6 py-10 text-center">
        <Receipt className="text-muted-foreground size-6" aria-hidden />
        <p className="text-muted-foreground mt-3 text-sm">{t("expenses.empty")}</p>
      </div>
    );
  }

  function onDelete(id: number) {
    // Une dépense effacée fausse le bénéfice de tout un mois : on demande.
    if (!window.confirm(t("expenses.confirmDelete"))) return;
    const data = new FormData();
    data.set("id", String(id));
    data.set("locale", locale);
    startTransition(async () => {
      await deleteExpense(data);
    });
  }

  return (
    <ul className="border-border divide-border mt-4 divide-y overflow-hidden rounded-lg border">
      {expenses.map((e) => {
        const category = t(`expenses.categories.${e.category}`);
        return (
          <li key={e.id} className="hover:bg-muted/40 flex items-center gap-2 ps-3 pe-1">
            <div className="min-w-0 flex-1 py-2">
              <div className="flex items-baseline justify-between gap-3">
                {/* Le libellé saisi porte l'information ; à défaut, la
                    catégorie prend sa place — jamais une ligne sans titre. */}
                <span className="truncate text-sm">{e.description || category}</span>
                <span className="tabular shrink-0 text-sm font-medium">
                  {formatMoney(e.amount, locale)}
                </span>
              </div>

              <div className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-xs">
                <span className="tabular shrink-0">{formatDate(e.spent_on, locale)}</span>
                {/* La catégorie ne se répète pas : elle n'apparaît ici que si
                    le titre au-dessus est un vrai libellé. */}
                {e.description && (
                  <>
                    <Dot />
                    <span className="truncate">{category}</span>
                  </>
                )}
                {/* Une dépense rattachée à une commande, c'est « Les frais » du
                    tableur : on garde le lien vers la commande concernée. */}
                {e.orders && (
                  <>
                    <Dot />
                    <Link
                      href={`/commandes/${e.order_id}`}
                      className="text-gold-strong truncate underline-offset-4 hover:underline"
                    >
                      <bdi>{e.orders.order_no}</bdi> {e.orders.customer_name}
                    </Link>
                  </>
                )}
              </div>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={isPending}
              onClick={() => onDelete(e.id)}
              className="text-muted-foreground hover:text-destructive size-11 shrink-0"
            >
              <Trash2 className="size-4" aria-hidden />
              <span className="sr-only">{t("common.delete")}</span>
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
