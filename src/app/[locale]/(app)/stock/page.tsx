import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, PackageOpen, PackageX, Plus, Shirt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { StockFilters } from "@/components/stock-filters";
import { StockTabs } from "@/components/stock-tabs";
import {
  countArchivedModels,
  countStock,
  getBlockedUnitIds,
  getCategories,
  getModels,
} from "@/lib/queries/stock";
import { getProfile, isOwner } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { todayIso } from "@/lib/rental-range";
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

  const canEdit = isOwner(profile);

  return (
    <div>
      {/* Titre reporté en `sr-only` : la barre de navigation dit déjà où l'on
          est. On le garde dans le DOM — un écran sans `h1` casse la navigation
          par titres des lecteurs d'écran. */}
      <div className="flex items-center justify-between gap-4">
        {archived ? (
          <>
            <h1 className="text-xl">{t("stock.archivedTitle")}</h1>
            <Button asChild variant="ghost" className="h-11">
              <Link href="/stock">
                <ArrowLeft className="icon-directional size-4" aria-hidden />
                {t("stock.backToCatalogue")}
              </Link>
            </Button>
          </>
        ) : (
          <>
            <h1 className="sr-only">{t("stock.title")}</h1>
            {canEdit && (
              <Button asChild className="ms-auto hidden md:inline-flex">
                <Link href="/stock/nouveau">
                  <Plus className="size-4" aria-hidden />
                  {t("stock.newModel")}
                </Link>
              </Button>
            )}
          </>
        )}
      </div>

      {!archived && (
        <div className="mt-4">
          <StockTabs active="models" />
        </div>
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
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {models.map((model) => {
            const stock = countStock(model.article_units ?? [], blocked);
            const name = l === "ar" && model.name_ar ? model.name_ar : model.name_fr;
            const category = model.categories
              ? l === "ar"
                ? model.categories.name_ar
                : model.categories.name_fr
              : null;

            return (
              <li key={model.id}>
                <Link
                  href={`/stock/${model.id}`}
                  className="border-border bg-card hover:border-gold-strong flex gap-3 rounded-lg border p-3 transition-colors"
                >
                  {/* Vignette carrée : sans photo, une icône plutôt qu'un trou. */}
                  <div className="bg-muted relative size-20 shrink-0 overflow-hidden rounded-md">
                    {model.photo_path ? (
                      <Image
                        src={photoUrl(model.photo_path)}
                        alt=""
                        fill
                        sizes="80px"
                        className="object-cover"
                      />
                    ) : (
                      <span className="text-muted-foreground flex size-full items-center justify-center">
                        <Shirt className="size-7" aria-hidden />
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{name}</p>
                    <p className="text-muted-foreground mt-0.5 truncate text-sm">
                      <bdi>{model.ref_code}</bdi>
                      {category && ` · ${category}`}
                    </p>

                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <span className="tabular font-medium">
                        {formatMoney(model.base_price, l)}
                      </span>
                      <span
                        className={
                          stock.available > 0
                            ? "text-success tabular"
                            : "text-muted-foreground tabular"
                        }
                      >
                        {t("stock.availableCount", {
                          available: stock.available,
                          total: stock.total,
                        })}
                      </span>
                      {archived && (
                        <Badge className="bg-muted text-muted-foreground border-transparent">
                          {t("stock.retired")}
                        </Badge>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
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
