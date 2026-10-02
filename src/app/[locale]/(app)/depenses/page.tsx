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
import { matchesSearch } from "@/lib/search";
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
  searchParams: Promise<{ mois?: string; q?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Les dépenses et le bénéfice ne regardent pas l'équipe. C'est la frontière
  // qui sépare `staff` de `owner`.
  await requireOwner(locale as Locale);

  const { mois, q = "" } = await searchParams;
  const t = await getTranslations();
  const l = locale as Locale;

  // Un paramètre d'URL inconnu retombe sur le mois courant plutôt que de
  // produire une erreur.
  const month = isValidMonth(mois) ? mois : new Date().toISOString().slice(0, 7);

  const [monthExpenses, orders] = await Promise.all([getExpenses(month), getRecentOrders()]);
  // Recherche de l'en-tête, sur le mois affiché : libellé, catégorie, ou la
  // commande liée. Le total suit le filtre — « combien de pressing ce mois ».
  const expenses = monthExpenses.filter((e) =>
    matchesSearch(
      q,
      e.description,
      t(`expenses.categories.${e.category}`),
      e.orders?.customer_name,
      e.orders?.order_no,
    ),
  );
  const total = expenses.reduce((sum, e) => sum + e.amount, 0);
  const monthHref = (m: string) => `/depenses?mois=${m}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  const monthLabel = new Intl.DateTimeFormat(l === "ar" ? "ar-DZ" : "fr-DZ", {
    month: "long",
    year: "numeric",
  }).format(new Date(`${month}-01T00:00:00Z`));

  return (
    <div>
      {/* Titre reporté en `sr-only` : la barre de navigation dit déjà où l'on
          est. On le garde dans le DOM — un écran sans `h1` casse la navigation
          par titres des lecteurs d'écran. */}
      <div className="flex items-center justify-end gap-4">
        <h1 className="sr-only">{t("nav.expenses")}</h1>
        <ExpenseForm orders={orders} />
      </div>

      {/* Navigateur de mois — une LIGNE, pas une carte encadrée. Le mois et son
          total se lisent d'un seul regard ; les chevrons gardent leurs 44 px. */}
      <div className="mt-2 flex items-center gap-1">
        <Button asChild variant="ghost" size="icon" className="size-11 shrink-0">
          <Link href={monthHref(shiftMonth(month, -1))}>
            <ChevronLeft className="size-5 rtl:-scale-x-100" aria-hidden />
            <span className="sr-only">{t("expenses.previousMonth")}</span>
          </Link>
        </Button>

        <p className="min-w-0 flex-1 truncate text-center">
          <span className="font-medium">{monthLabel}</span>
          <span className="text-muted-foreground" aria-hidden>
            {" · "}
          </span>
          <span className="tabular text-muted-foreground text-sm">
            {t("expenses.total")} {formatMoney(total, l)}
          </span>
        </p>

        <Button asChild variant="ghost" size="icon" className="size-11 shrink-0">
          <Link href={monthHref(shiftMonth(month, 1))}>
            <ChevronRight className="size-5 rtl:-scale-x-100" aria-hidden />
            <span className="sr-only">{t("expenses.nextMonth")}</span>
          </Link>
        </Button>
      </div>

      <ExpensesList expenses={expenses} />
    </div>
  );
}
