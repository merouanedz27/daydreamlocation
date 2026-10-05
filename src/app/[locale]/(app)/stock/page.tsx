import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, PackageOpen, PackageX, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { StockFilters } from "@/components/stock-filters";
import { StockModels, type StockModelRow } from "@/components/stock-models";
import { StockTabs } from "@/components/stock-tabs";
import {
  countArchivedModels,
  countStock,
  getBlockedUnitIds,
  getCategories,
  getModels,
} from "@/lib/queries/stock";
import { getProfile, canManageStock } from "@/lib/auth";
import { todayIso } from "@/lib/rental-range";
import { sortSizes } from "@/lib/sizes";
import { photoUrl } from "@/lib/storage";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "stock" });
  return { title: t("title") };
}

export default async function StockPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ categorie?: string; q?: string; archives?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { categorie, q, archives } = await searchParams;
  const l = locale as Locale;
  const t = await getTranslations();

  // Les modèles retirés du catalogue ont leur propre vue, sur la même page :
  // mêmes cartes, mêmes filtres, mais une liste qui ne se mélange jamais à
  // celle des costumes louables.
  const archived = archives === "1";

  // Une seule requête de disponibilité pour la page entière : la demander par
  // modèle referait un aller-retour par carte.
  const [categories, models, profile, archivedCount, blocked] = await Promise.all([
    getCategories(),
    getModels({ categorySlug: categorie, search: q, archived }),
    getProfile(),
    archived ? Promise.resolve(0) : countArchivedModels(),
    getBlockedUnitIds(todayIso()),
  ]);

  const canEdit = canManageStock(profile);

  // Données prêtes à afficher : le client choisit seulement la présentation
  // (cartes ou tableau), jamais ce qui est compté comme disponible.
  const rows: StockModelRow[] = models.map((model) => {
    const stock = countStock(model.article_units ?? [], blocked);
    return {
      id: model.id,
      name: l === "ar" && model.name_ar ? model.name_ar : model.name_fr,
      ref: model.ref_code,
      category: model.categories
        ? l === "ar"
          ? model.categories.name_ar
          : model.categories.name_fr
        : null,
      price: model.base_price,
      purchasePrice: model.purchase_price,
      photo: model.photo_path ? photoUrl(model.photo_path) : null,
      available: stock.available,
      total: stock.total,
      // Les tailles en stock, pièces retirées exclues : « 46 · 48 · 50 ».
      sizes: sortSizes(
        (model.article_units ?? []).filter((u) => u.status !== "retire").map((u) => u.size),
      ),
    };
  });

  return (
    <div>
      {/* Titre reporté en `sr-only` : la barre de navigation dit déjà où l'on
          est. On le garde dans le DOM — un écran sans `h1` casse la navigation
          par titres des lecteurs d'écran. */}
      {archived ? (
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl">{t("stock.archivedTitle")}</h1>
          <Button asChild variant="ghost" className="h-11">
            <Link href="/stock">
              <ArrowLeft className="icon-directional size-4" aria-hidden />
              {t("stock.backToCatalogue")}
            </Link>
          </Button>
        </div>
      ) : (
        <>
          <h1 className="sr-only">{t("stock.title")}</h1>
          {/* Le bouton « Nouveau modèle » vit dans la barre d'onglets, à la
              même place que « Nouvel ensemble » sur l'autre onglet. */}
          <StockTabs
            active="models"
            action={canEdit ? { href: "/stock/nouveau", label: t("stock.newModel") } : undefined}
          />
        </>
      )}

      <div className="mt-4">
        <StockFilters categories={categories} locale={l} />
      </div>

      {!models.length ? (
        <div className="border-border mt-8 flex flex-col items-center rounded-lg border border-dashed px-6 py-16 text-center">
          <PackageOpen className="text-muted-foreground size-8" aria-hidden />
          <p className="text-muted-foreground mt-4 text-sm">
            {q || categorie
              ? t("stock.noMatch")
              : archived
                ? t("stock.archivedEmpty")
                : t("common.empty")}
          </p>
          {canEdit && !archived && !q && !categorie && (
            <Button asChild className="mt-6">
              <Link href="/stock/nouveau">
                <Plus className="size-4" aria-hidden />
                {t("stock.newModel")}
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <StockModels models={rows} archived={archived} canEdit={canEdit} />
      )}

      {/* Unique porte d'entrée vers les modèles retirés. Discrète — et
          présente seulement s'il y en a : sans elle, un retrait serait un
          aller sans retour. */}
      {!archived && archivedCount > 0 && (
        <div className="mt-8 text-center">
          <Button asChild variant="ghost" className="text-muted-foreground h-11">
            <Link href="/stock?archives=1">
              <PackageX className="size-4" aria-hidden />
              {t("stock.archivedLink", { count: archivedCount })}
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
