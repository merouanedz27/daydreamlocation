import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Receipt } from "lucide-react";
import { FraisAddDrawer } from "@/components/frais-quick-form";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { ExpensesList } from "@/components/expenses-list";
import { isOwner, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDayMonth, formatMoney } from "@/lib/format";
import type { Locale } from "@/i18n/routing";
import { Highlight } from "@/components/highlight";
import type { ExpenseRow } from "@/lib/queries/expenses";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "nav" });
  return { title: t("frais") };
}

/** Assez pour relire sa journée et la veille, pas un registre. */
const RECENT = 30;

/**
 * L'onglet « Frais » de son AppSheet : on note le tailleur, le pressing, la
 * livraison au moment de payer.
 *
 * OUVERT À TOUTE L'ÉQUIPE pour l'ajout. La liste dessous passe par la RLS :
 * un employé ne relit que SES frais (pour repérer une faute de frappe), le
 * propriétaire les voit tous — avec la corbeille, lui seul pouvant effacer
 * un frais. AUCUN total ici : le total et le bénéfice sont sur le tableau de
 * bord, réservé au propriétaire. (L'ancienne page « Dépenses » faisait
 * doublon avec celle-ci et a disparu : tous les frais vivent ici.)
 */
export default async function FraisPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; tout?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;
  const profile = await requireProfile(l);
  const owner = isOwner(profile);
  const t = await getTranslations();

  // Recherche de l'en-tête : sur le libellé du frais (« pressing », « Med »).
  const { q = "", tout } = await searchParams;
  const term = q
    .replace(/[%_\\]/g, " ")
    .trim()
    .slice(0, 80);
  // « Voir tout » : la liste entière, sur demande. La RLS limite toujours un
  // employé à SES frais.
  const showAll = tout === "1";

  const supabase = await createClient();
  let request = supabase
    .from("expenses")
    .select("*, orders ( order_no, customer_name )");
  if (term) request = request.ilike("description", `%${term}%`);
  request = request
    .order("spent_on", { ascending: false })
    .order("created_at", { ascending: false });
  // Une ligne de plus que l'affichage : elle dit s'il en reste, sans requête
  // de comptage.
  const { data } = await (showAll ? request : request.limit(RECENT + 1));
  const rows = (data ?? []) as unknown as ExpenseRow[];
  const hasMore = !showAll && rows.length > RECENT;
  const recent = showAll ? rows : rows.slice(0, RECENT);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl">{t("nav.frais")}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t("frais.hint")}
          </p>
        </div>
        <FraisAddDrawer />
      </div>

      <section aria-labelledby="frais-recent">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 id="frais-recent" className="text-base font-medium">
            {showAll
              ? owner
                ? t("frais.allAll")
                : t("frais.allMine")
              : owner
                ? t("frais.recentAll")
                : t("frais.recentMine")}
          </h2>
        </div>

        {recent.length && owner ? (
          <ExpensesList expenses={recent} />
        ) : recent.length ? (
          <ul className="border-border bg-card overflow-hidden rounded-lg border">
            {recent.map((row) => (
              <li
                key={row.id}
                className="border-border flex min-h-12 items-center gap-3 border-b px-3 py-2 last:border-b-0"
              >
                <span className="text-muted-foreground tabular w-12 shrink-0 text-xs">
                  {formatDayMonth(row.spent_on, l)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  <Highlight
                    text={
                      row.description ||
                      t(`expenses.categories.${row.category}`)
                    }
                  />
                </span>
                <span className="tabular shrink-0 text-sm font-medium">
                  {formatMoney(Number(row.amount), l)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="border-border flex flex-col items-center rounded-lg border border-dashed px-6 py-10 text-center">
            <Receipt className="text-muted-foreground size-7" aria-hidden />
            <p className="text-muted-foreground mt-3 text-sm">
              {term ? t("search.noMatch", { q: term }) : t("frais.empty")}
            </p>
          </div>
        )}

        {hasMore && (
          <Button asChild variant="outline" className="mt-3 h-11 w-full">
            <Link
              href={{
                pathname: "/frais",
                query: { ...(term && { q: term }), tout: "1" },
              }}
              // La suite s'ajoute SOUS les lignes déjà lues : on reste à la
              // même hauteur et on continue de défiler, sans remonter en haut.
              // `replace` : « Retour » ne repasse pas par la liste tronquée.
              scroll={false}
              replace
            >
              {t("frais.seeAll")}
            </Link>
          </Button>
        )}
      </section>

      {/* La place du bouton rond « + » (téléphone), sous la dernière ligne. */}
      <div className="h-14 md:hidden" aria-hidden />
    </div>
  );
}
