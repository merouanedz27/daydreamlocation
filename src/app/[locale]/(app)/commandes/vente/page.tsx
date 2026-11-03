import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { OrderSaleForm } from "@/components/order-sale-form";
import { requireProfile } from "@/lib/auth";
import { getOrderCatalogue, getQuickSuggestions } from "@/lib/queries/orders";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "orders.sale" });
  return { title: t("title") };
}

/**
 * Vente seule au comptoir : scanner la paire, encaisser. Vendre est le métier
 * de toute l'équipe, comme créer une commande : `staff` suffit.
 */
export default async function SaleOrderPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireProfile(locale as Locale);

  const t = await getTranslations();
  const [{ models }, { customers }] = await Promise.all([
    getOrderCatalogue(),
    getQuickSuggestions(),
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

      {/* Tout le catalogue : le formulaire ne vend que le stock de VENTE,
          mais reconnaît une pièce de location scannée par erreur. */}
      <OrderSaleForm models={models} customers={customers} />
    </div>
  );
}
