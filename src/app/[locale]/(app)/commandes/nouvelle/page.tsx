import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronLeft, ScanLine } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { OrderQuickForm } from "@/components/order-quick-form";
import { requireProfile } from "@/lib/auth";
import { getOrderCatalogue, getQuickSuggestions, getSettings } from "@/lib/queries/orders";
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
  const [{ models }, { items, customers }, settings] = await Promise.all([
    getOrderCatalogue(),
    getQuickSuggestions(),
    getSettings(),
  ]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <Link
          href="/commandes"
          className="text-muted-foreground hover:text-foreground -ms-2 inline-flex min-h-11 items-center gap-1 px-2 text-sm"
        >
          <ChevronLeft className="size-4 rtl:-scale-x-100" aria-hidden />
          {t("orders.title")}
        </Link>
        {/* Un client qui ne fait qu'acheter : l'écran court de la vente. */}
        <Link
          href="/commandes/vente"
          className="text-gold-strong inline-flex min-h-11 items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline"
        >
          <ScanLine className="size-4" aria-hidden />
          {t("orders.sale.shortcut")}
        </Link>
      </div>

      <OrderQuickForm models={models} items={items} customers={customers} settings={settings} />
    </div>
  );
}
