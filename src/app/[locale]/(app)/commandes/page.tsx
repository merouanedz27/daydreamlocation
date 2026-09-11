import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { OrdersFilters } from "@/components/orders-filters";
import { OrdersList } from "@/components/orders-list";
import { getOrdersPage } from "@/lib/queries/orders-list";
import { parseOrdersQuery } from "@/lib/orders-query";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "orders" });
  return { title: t("title") };
}

export default async function OrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    q?: string;
    statut?: string;
    tri?: string;
    sens?: string;
    page?: string;
  }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations();

  // Recherche, filtre, tri et pagination viennent de l'URL et sont appliqués
  // EN BASE. Toute valeur inconnue retombe sur la valeur par défaut plutôt que
  // de produire une erreur — un lien mal recopié ne doit pas casser l'écran.
  const query = parseOrdersQuery(await searchParams);
  const { rows, total } = await getOrdersPage(query);

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl">{t("orders.title")}</h1>
        <Button asChild className="hidden md:inline-flex">
          <Link href="/commandes/nouvelle">
            <Plus className="size-4" aria-hidden />
            {t("orders.new")}
          </Link>
        </Button>
      </div>

      <OrdersFilters />

      <OrdersList
        orders={rows}
        total={total}
        page={query.page}
        sort={query.sort}
        ascending={query.ascending}
      />
    </div>
  );
}
