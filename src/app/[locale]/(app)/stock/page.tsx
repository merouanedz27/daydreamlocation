import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PackageOpen, Plus, Shirt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { StockFilters } from "@/components/stock-filters";
import { getCategories, getModels, countStock } from "@/lib/queries/stock";
import { getProfile, isOwner } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
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
  searchParams: Promise<{ categorie?: string; q?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { categorie, q } = await searchParams;
  const l = locale as Locale;
  const t = await getTranslations();

  const [categories, models, profile] = await Promise.all([
    getCategories(),
    getModels({ categorySlug: categorie, search: q }),
    getProfile(),
  ]);

  const canEdit = isOwner(profile);

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl">{t("stock.title")}</h1>
        {canEdit && (
          <Button asChild className="hidden md:inline-flex">
            <Link href="/stock/nouveau">
              <Plus className="size-4" aria-hidden />
              {t("stock.newModel")}
            </Link>
          </Button>
        )}
      </div>

      <div className="mt-4">
        <StockFilters categories={categories} locale={l} />
      </div>

      {!models.length ? (
        <div className="border-border mt-8 flex flex-col items-center rounded-lg border border-dashed px-6 py-16 text-center">
          <PackageOpen className="text-muted-foreground size-8" aria-hidden />
          <p className="text-muted-foreground mt-4 text-sm">
            {q || categorie ? t("stock.noMatch") : t("common.empty")}
          </p>
          {canEdit && !q && !categorie && (
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
            const stock = countStock(model.article_units ?? []);
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
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
