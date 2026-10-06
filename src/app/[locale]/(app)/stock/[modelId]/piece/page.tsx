import { sortParts, type Part } from "@/lib/stock-refs";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { UnitForm } from "@/components/unit-form";
import { getModel } from "@/lib/queries/stock";
import { requireStockManager } from "@/lib/auth";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "stock" });
  return { title: t("addPiece") };
}

export default async function NewUnitPage({
  params,
}: {
  params: Promise<{ locale: string; modelId: string }>;
}) {
  const { locale, modelId } = await params;
  setRequestLocale(locale);
  await requireStockManager(locale as Locale);

  const id = Number(modelId);
  if (!Number.isFinite(id)) notFound();

  const [model, t] = await Promise.all([getModel(id), getTranslations()]);
  if (!model) notFound();

  return (
    <div className="mx-auto max-w-lg">
      <Button asChild variant="ghost" size="sm" className="-ms-2 mb-2">
        <Link href={`/stock/${model.id}`}>
          <ArrowLeft className="icon-directional size-4" aria-hidden />
          {t("common.back")}
        </Link>
      </Button>

      <h1 className="text-2xl">{t("stock.addPiece")}</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        {locale === "ar" && model.name_ar ? model.name_ar : model.name_fr}
      </p>

      <div className="ornament my-6" aria-hidden>
        <span className="ornament-diamond" />
      </div>

      <UnitForm
        modelId={model.id}
        refCode={model.ref_code}
        existingRefs={(model.article_units ?? []).map((u) => u.ref_code)}
        categorySlug={model.categories?.slug ?? null}
        parts={sortParts(model.article_model_parts ?? []).map((p) => p.part as Part)}
      />
    </div>
  );
}
