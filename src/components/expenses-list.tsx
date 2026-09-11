"use client";

import { useTransition } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Receipt, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { deleteExpense } from "@/lib/actions/expenses";
import { formatDate, formatMoney } from "@/lib/format";
import type { ExpenseRow } from "@/lib/queries/expenses";
import type { Locale } from "@/i18n/routing";

export function ExpensesList({ expenses }: { expenses: ExpenseRow[] }) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const [isPending, startTransition] = useTransition();

  if (!expenses.length) {
    return (
      <div className="border-border mt-6 flex flex-col items-center rounded-lg border border-dashed px-6 py-16 text-center">
        <Receipt className="text-muted-foreground size-8" aria-hidden />
        <p className="text-muted-foreground mt-4 text-sm">{t("expenses.empty")}</p>
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
    <ul className="mt-6 space-y-2">
      {expenses.map((e) => (
        <li
          key={e.id}
          className="border-border flex items-start gap-3 rounded-lg border p-3"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-muted text-muted-foreground border-transparent">
                {t(`expenses.categories.${e.category}`)}
              </Badge>
              <span className="text-muted-foreground tabular text-sm">
                {formatDate(e.spent_on, locale)}
              </span>
            </div>

            {e.description && <p className="mt-1.5 truncate text-sm">{e.description}</p>}

            {/* Une dépense rattachée à une commande, c'est « Les frais » du
                tableur : on donne le lien vers la commande concernée. */}
            {e.orders && (
              <Link
                href={`/commandes/${e.order_id}`}
                className="text-gold-strong mt-1 inline-block text-sm underline-offset-4 hover:underline"
              >
                <bdi>{e.orders.order_no}</bdi> · {e.orders.customer_name}
              </Link>
            )}
          </div>

          <span className="tabular shrink-0 font-medium">
            {formatMoney(e.amount, locale)}
          </span>

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
      ))}
    </ul>
  );
}
