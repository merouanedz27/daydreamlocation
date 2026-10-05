import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronRight, Receipt } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { FraisQuickForm } from "@/components/frais-quick-form";
import { isOwner, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDayMonth, formatMoney } from "@/lib/format";
import type { Locale } from "@/i18n/routing";
import { Highlight } from "@/components/highlight";

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
 * propriétaire les voit tous. AUCUN total ici : les totaux, le bénéfice et le
 * registre complet restent sur `/depenses` et le bilan, réservés au
 * propriétaire.
 */
export default async function FraisPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;
  const profile = await requireProfile(l);
  const owner = isOwner(profile);
  const t = await getTranslations();

  // Recherche de l'en-tête : sur le libellé du frais (« pressing », « Med »).
  const { q = "" } = await searchParams;
  const term = q.replace(/[%_\\]/g, " ").trim().slice(0, 80);

  const supabase = await createClient();
  let request = supabase
    .from("expenses")
    .select("id, spent_on, category, amount, description");
  if (term) request = request.ilike("description", `%${term}%`);
  const { data } = await request
    .order("spent_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(RECENT);
  const recent = data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl">{t("nav.frais")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("frais.hint")}</p>
      </div>

      <FraisQuickForm />

      <section aria-labelledby="frais-recent">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 id="frais-recent" className="text-base font-medium">
            {owner ? t("frais.recentAll") : t("frais.recentMine")}
          </h2>
          {owner && (
            <Link
              href="/depenses"
              className="text-gold-strong flex min-h-11 items-center gap-1 text-sm font-medium"
            >
              {t("frais.seeExpenses")}
              <ChevronRight className="size-4 rtl:-scale-x-100" aria-hidden />
            </Link>
          )}
        </div>

        {recent.length ? (
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
                  <Highlight text={row.description || t(`expenses.categories.${row.category}`)} />
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
      </section>
    </div>
  );
}
