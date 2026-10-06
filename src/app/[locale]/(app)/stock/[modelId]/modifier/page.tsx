import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { ModelForm } from "@/components/model-form";
import { ModelDangerZone } from "@/components/model-danger-zone";
import { getCategories, getModel } from "@/lib/queries/stock";
import { requireStockManager } from "@/lib/auth";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "stock" });
  return { title: t("editModel") };
}

export default async function EditModelPage({
  params,
}: {
  params: Promise<{ locale: string; modelId: string }>;
}) {
  const { locale, modelId } = await params;
  setRequestLocale(locale);

  // Réservé au propriétaire. Les Server Actions le revérifient de leur côté :
  // elles sont appelables directement, sans passer par cette page.
  await requireStockManager(locale as Locale);

  const id = Number(modelId);
  if (!Number.isFinite(id)) notFound();

  const [model, categories, t] = await Promise.all([
    getModel(id),
    getCategories(),
    getTranslations(),
  ]);
  if (!model) notFound();

  const units = model.article_units ?? [];

  // Ce qui décide entre effacer et retirer : une seule ligne de commande
  // suffit à faire du modèle une pièce de comptabilité. On regarde TOUTES les
  // lignes, y compris inactives — une commande annulée reste une trace.
  const hasHistory = units.some((u) => (u.order_lines ?? []).length > 0);

  return (
    <div className="mx-auto max-w-lg">
      <Button asChild variant="ghost" size="sm" className="-ms-2 mb-2">
        <Link href={`/stock/${model.id}`}>
          <ArrowLeft className="icon-directional size-4" aria-hidden />
          {t("common.back")}
        </Link>
      </Button>

      <h1 className="text-2xl">{t("stock.editModel")}</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        <bdi>{model.ref_code}</bdi>
      </p>

      <div className="ornament my-6" aria-hidden>
        <span className="ornament-diamond" />
      </div>

      <ModelForm
        categories={categories}
        model={model}
        parts={model.article_model_parts ?? []}
        pieceCount={units.length}
      />

      {/* Le geste destructeur vit ICI, au bout de la page de modification, et
          non sur la fiche : il faut l'avoir cherché pour le trouver. */}
      <section className="border-border mt-10 border-t pt-6">
        <h2 className="text-destructive text-base font-medium">
          {t("stock.dangerZone")}
        </h2>
        <div className="mt-2">
          <ModelDangerZone
            modelId={model.id}
            name={model.ref_code}
            pieceCount={units.length}
            hasHistory={hasHistory}
            isActive={model.is_active}
          />
        </div>
      </section>
    </div>
  );
}
