import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { EnsembleForm } from "@/components/ensemble-form";
import { EnsembleDelete } from "@/components/ensemble-delete";
import { getEnsemble } from "@/lib/queries/ensembles";
import { getOrderCatalogue } from "@/lib/queries/orders";
import { requireStockManager } from "@/lib/auth";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "stock" });
  return { title: t("editEnsemble") };
}

export default async function EditEnsemblePage({
  params,
}: {
  params: Promise<{ locale: string; ensembleId: string }>;
}) {
  const { locale, ensembleId } = await params;
  setRequestLocale(locale);

  await requireStockManager(locale as Locale);

  const id = Number(ensembleId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const [ensemble, { models }, t] = await Promise.all([
    getEnsemble(id),
    getOrderCatalogue(),
    getTranslations(),
  ]);
  if (!ensemble) notFound();

  return (
    <div className="mx-auto max-w-lg">
      <Button asChild variant="ghost" size="sm" className="-ms-2 mb-2">
        <Link href="/stock/ensembles">
          <ArrowLeft className="icon-directional size-4" aria-hidden />
          {t("common.back")}
        </Link>
      </Button>

      <h1 className="text-2xl">{t("stock.editEnsemble")}</h1>

      <div className="ornament my-6" aria-hidden>
        <span className="ornament-diamond" />
      </div>

      <EnsembleForm models={models} ensemble={ensemble} />

      <section className="border-border mt-10 border-t pt-6">
        <EnsembleDelete id={ensemble.id} name={ensemble.name} />
      </section>
    </div>
  );
}
