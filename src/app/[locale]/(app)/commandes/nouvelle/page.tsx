import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { OrderForm } from "@/components/order-form";
import { requireProfile } from "@/lib/auth";
import { getOrderCatalogue, getSettings } from "@/lib/queries/orders";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "orders" });
  return { title: t("newTitle") };
}

export default async function NewOrderPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Créer une commande est le métier quotidien de l'équipe : `staff` suffit.
  // Contrairement au stock, pas de `requireOwner` ici.
  await requireProfile(locale as Locale);

  const t = await getTranslations();
  const [{ models, ensembles }, settings] = await Promise.all([
    getOrderCatalogue(),
    getSettings(),
  ]);

  return (
    <div>
      <Link
        href="/commandes"
        className="text-muted-foreground hover:text-foreground -ms-2 mb-4 inline-flex min-h-11 items-center gap-1 px-2 text-sm"
      >
        <ChevronLeft className="size-4 rtl:-scale-x-100" aria-hidden />
        {t("orders.title")}
      </Link>

      <h1 className="sr-only">{t("orders.newTitle")}</h1>

      <OrderForm models={models} ensembles={ensembles} settings={settings} />
    </div>
  );
}
