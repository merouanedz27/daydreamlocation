import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ClipboardCheck, Download, Plus } from "lucide-react";
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
  const raw = await searchParams;
  const query = parseOrdersQuery(raw);

  // L'export reprend les filtres AFFICHÉS (recherche, statut, tri), sans la
  // page : le fichier contient tout le résultat filtré, pas les 25 lignes vues.
  const exportParams = new URLSearchParams({ locale });
  for (const key of ["q", "statut", "tri", "sens"] as const) {
    if (raw[key]) exportParams.set(key, raw[key]);
  }
  const { rows, total } = await getOrdersPage(query);

  return (
    <div>
      {/* Titre reporté en `sr-only` : la barre de navigation dit déjà où l'on
          est. On le garde dans le DOM — un écran sans `h1` casse la navigation
          par titres des lecteurs d'écran. */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <h1 className="sr-only">{t("orders.title")}</h1>
        {/* Les documents de l'équipe, À TOUTES LES LARGEURS : la feuille du jour
            se prépare aussi depuis le téléphone, la veille au soir. */}
        <Button asChild variant="outline" className="h-11">
          <Link href="/imprimer/journee">
            <ClipboardCheck className="size-4" aria-hidden />
            {t("print.daySheetButton")}
          </Link>
        </Button>
        {/* Un vrai lien de téléchargement, pas un `Link` : la route `/api` ne
            porte pas de locale et renvoie un fichier, pas une page. */}
        <Button asChild variant="outline" className="h-11">
          <a href={`/api/commandes/export?${exportParams}`} download>
            <Download className="size-4" aria-hidden />
            {t("orders.export")}
          </a>
        </Button>
        <Button asChild className="hidden h-11 md:inline-flex">
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
