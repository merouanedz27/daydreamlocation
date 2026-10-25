import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PressingSend, PressingTabs } from "@/components/pressing-board";
import { StockFilters } from "@/components/stock-filters";
import { requireProfile } from "@/lib/auth";
import { getBlockedUnitIds, getCategories, getPressingUnits } from "@/lib/queries/stock";
import { todayIso } from "@/lib/rental-range";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "nav" });
  return { title: t("pressing") };
}

/**
 * Le pressing (dégraissage), onglet « À envoyer » : les pièces disponibles,
 * filtrables par catégorie. Ce qui y est déjà parti vit sur sa propre page,
 * /pressing/en-cours.
 *
 * OUVERT À TOUTE L'ÉQUIPE — ce sont les employés qui portent les costumes au
 * pressing. Ils ne peuvent pourtant rien changer d'autre au stock : la page
 * passe par `set_pressing`, qui ne sait faire que disponible ⇄ nettoyage.
 */
export default async function PressingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; categorie?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireProfile(locale as Locale);

  const { q = "", categorie = "" } = await searchParams;
  const [t, units, blocked, categories] = await Promise.all([
    getTranslations(),
    getPressingUnits(),
    getBlockedUnitIds(todayIso()),
    getCategories(),
  ]);

  const available = units.filter((u) => u.status === "disponible");
  const outCount = units.length - available.length;
  // Pas de puce vide : seulement les catégories qui ont une pièce à envoyer.
  const used = new Set(available.map((u) => u.categorySlug));
  const shownCategories = categories.filter((c) => used.has(c.slug));
  const filtered = categorie ? available.filter((u) => u.categorySlug === categorie) : available;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl">{t("nav.pressing")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("pressing.hint")}</p>
      </div>

      <PressingTabs toSend={available.length} out={outCount} />

      {shownCategories.length > 1 && (
        <StockFilters categories={shownCategories} locale={locale as Locale} />
      )}

      <PressingSend units={filtered} rentedIds={[...blocked]} q={q.trim().slice(0, 80)} />
    </div>
  );
}
