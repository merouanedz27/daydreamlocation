import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { ModelForm } from "@/components/model-form";
import { getCategories } from "@/lib/queries/stock";
import { requireStockManager } from "@/lib/auth";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "stock" });
  return { title: t("newModel") };
}

export default async function NewModelPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Réservé au propriétaire. La Server Action le revérifie de son côté :
  // elle est appelable directement, sans passer par cette page.
  await requireStockManager(locale as Locale);

  const [categories, t] = await Promise.all([getCategories(), getTranslations()]);

  return (
    <div className="mx-auto max-w-lg">
      <Button asChild variant="ghost" size="sm" className="-ms-2 mb-2">
        <Link href="/stock">
          <ArrowLeft className="icon-directional size-4" aria-hidden />
          {t("common.back")}
        </Link>
      </Button>

      <h1 className="text-2xl">{t("stock.newModel")}</h1>
      <p className="text-muted-foreground mt-1 text-sm">{t("stock.newModelHint")}</p>

      <div className="ornament my-6" aria-hidden>
        <span className="ornament-diamond" />
      </div>

      <ModelForm categories={categories} />
    </div>
  );
}
