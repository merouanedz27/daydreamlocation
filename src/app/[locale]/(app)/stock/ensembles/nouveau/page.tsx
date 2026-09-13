import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { EnsembleForm } from "@/components/ensemble-form";
import { getOrderCatalogue } from "@/lib/queries/orders";
import { requireOwner } from "@/lib/auth";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "stock" });
  return { title: t("newEnsemble") };
}

export default async function NewEnsemblePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Réservé au propriétaire ; `saveEnsemble` le revérifie de son côté.
  await requireOwner(locale as Locale);

  // Le catalogue de la saisie de commande : modèles actifs, pièces non retirées.
  const [{ models }, t] = await Promise.all([getOrderCatalogue(), getTranslations()]);

  return (
    <div className="mx-auto max-w-lg">
      <Button asChild variant="ghost" size="sm" className="-ms-2 mb-2">
        <Link href="/stock/ensembles">
          <ArrowLeft className="icon-directional size-4" aria-hidden />
          {t("common.back")}
        </Link>
      </Button>

      <h1 className="text-2xl">{t("stock.newEnsemble")}</h1>
      <p className="text-muted-foreground mt-1 text-sm">{t("stock.newEnsembleHint")}</p>

      <div className="ornament my-6" aria-hidden>
        <span className="ornament-diamond" />
      </div>

      <EnsembleForm models={models} />
    </div>
  );
}
