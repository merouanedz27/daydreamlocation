import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { ExpenseForm } from "@/components/expense-form";
import { ExpensesList } from "@/components/expenses-list";
import { requireOwner } from "@/lib/auth";
import { getExpenses, getRecentOrders } from "@/lib/queries/expenses";
import { formatMoney } from "@/lib/format";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "nav" });
  return { title: t("expenses") };
}

/** « 2026-09 » ± 1 mois, sans dépendre du fuseau du serveur. */
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function isValidMonth(value: string | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}$/.test(value);
}

export default async function ExpensesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ mois?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Les dépenses et le bénéfice ne regardent pas l'équipe. C'est la frontière
  // qui sépare `staff` de `owner`.
  await requireOwner(locale as Locale);

  const { mois } = await searchParams;
  const t = await getTranslations();
  const l = locale as Locale;

  // Un paramètre d'URL inconnu retombe sur le mois courant plutôt que de
  // produire une erreur.
  const month = isValidMonth(mois) ? mois : new Date().toISOString().slice(0, 7);

  const [expenses, orders] = await Promise.all([getExpenses(month), getRecentOrders()]);
  const total = expenses.reduce((sum, e) => sum + e.amount, 0);

  const monthLabel = new Intl.DateTimeFormat(l === "ar" ? "ar-DZ" : "fr-DZ", {
    month: "long",
    year: "numeric",
  }).format(new Date(`${month}-01T00:00:00Z`));

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl">{t("nav.expenses")}</h1>
        <ExpenseForm orders={orders} />
      </div>

      <div className="border-border mt-6 flex items-center justify-between gap-3 rounded-lg border p-3">
        <Button asChild variant="ghost" size="icon" className="size-11 shrink-0">
          <Link href={`/depenses?mois=${shiftMonth(month, -1)}`}>
            <ChevronLeft className="size-5 rtl:-scale-x-100" aria-hidden />
            <span className="sr-only">{t("expenses.previousMonth")}</span>
          </Link>
        </Button>

        <div className="min-w-0 text-center">
          <p className="truncate font-medium">{monthLabel}</p>
          <p className="tabular text-muted-foreground text-sm">
            {t("dashboard.expenses")} {formatMoney(total, l)}
          </p>
        </div>

        <Button asChild variant="ghost" size="icon" className="size-11 shrink-0">
          <Link href={`/depenses?mois=${shiftMonth(month, 1)}`}>
            <ChevronRight className="size-5 rtl:-scale-x-100" aria-hidden />
            <span className="sr-only">{t("expenses.nextMonth")}</span>
          </Link>
        </Button>
      </div>

      <ExpensesList expenses={expenses} />
    </div>
  );
}
