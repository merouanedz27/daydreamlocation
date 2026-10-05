import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronRight, Layers, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { StockTabs } from "@/components/stock-tabs";
import { getEnsembles } from "@/lib/queries/ensembles";
import { getProfile, canManageStock } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { matchesSearch } from "@/lib/search";
import { Highlight } from "@/components/highlight";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "stock" });
  return { title: t("tabEnsembles") };
}

/**
 * Les ensembles — « Costume n°12 », « Costume n°7 ».
 *
 * Lisibles par toute l'équipe : l'employé vérifie ici ce que contient un
 * ensemble avant de le proposer. Seul le propriétaire les crée et les modifie
 * (RLS `ensembles_*`), d'où la carte cliquable pour lui seul.
 */
export default async function EnsemblesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;

  const [all, profile, t, { q = "" }] = await Promise.all([
    getEnsembles(),
    getProfile(),
    getTranslations(),
    searchParams,
  ]);
  // Recherche de l'en-tête : sur le nom de l'ensemble, ou une de ses pièces
  // (« Gio-079 » retrouve tous les costumes qui contiennent cette veste).
  const ensembles = all.filter((e) =>
    matchesSearch(q, e.name, ...e.pieces.flatMap((p) => [p.ref_code, p.model_name_fr, p.model_name_ar])),
  );
  const canEdit = canManageStock(profile);

  return (
    <div>
      <h1 className="sr-only">{t("stock.tabEnsembles")}</h1>

      <StockTabs
        active="ensembles"
        action={
          canEdit ? { href: "/stock/ensembles/nouveau", label: t("stock.newEnsemble") } : undefined
        }
      />

      {q && !ensembles.length ? (
        <p className="text-muted-foreground mt-6 text-center text-sm">{t("search.noMatch", { q })}</p>
      ) : !ensembles.length ? (
        <div className="border-border mt-6 flex flex-col items-center rounded-lg border border-dashed px-6 py-16 text-center">
          <Layers className="text-muted-foreground size-8" aria-hidden />
          <p className="text-muted-foreground mt-4 max-w-xs text-sm">{t("stock.ensemblesEmpty")}</p>
          {canEdit && (
            <Button asChild className="mt-6 h-11">
              <Link href="/stock/ensembles/nouveau">
                <Plus className="size-4" aria-hidden />
                {t("stock.newEnsemble")}
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ensembles.map((e) => {
            const sum = e.pieces.reduce((acc, p) => acc + p.price, 0);
            const hasRetired = e.pieces.some((p) => p.status === "retire");

            const body = (
              <>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      <Highlight text={e.name} />
                    </p>
                    <p className="text-muted-foreground mt-0.5 text-sm">
                      {t("orders.ensemblePieces", { count: e.pieces.length })}
                      {" · "}
                      <span className="tabular">
                        {e.package_price !== null
                          ? t("stock.packageLabel", { amount: formatMoney(e.package_price, l) })
                          : formatMoney(sum, l)}
                      </span>
                    </p>
                  </div>
                  {canEdit && (
                    <ChevronRight
                      className="text-muted-foreground mt-1 size-4 shrink-0 rtl:-scale-x-100"
                      aria-hidden
                    />
                  )}
                </div>

                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {e.pieces.map((p) => (
                    <li key={p.unit_id}>
                      <Badge
                        variant="outline"
                        className={p.status === "retire" ? "text-muted-foreground line-through" : undefined}
                      >
                        <bdi>
                          <Highlight text={p.ref_code} />
                        </bdi>
                        {p.size && ` · ${p.size}`}
                      </Badge>
                    </li>
                  ))}
                </ul>

                {hasRetired && (
                  <p className="text-warning mt-2 text-xs">{t("stock.ensembleHasRetired")}</p>
                )}
              </>
            );

            return (
              <li key={e.id}>
                {canEdit ? (
                  <Link
                    href={`/stock/ensembles/${e.id}`}
                    className="border-border bg-card hover:border-gold-strong block rounded-lg border p-3 transition-colors"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="border-border bg-card rounded-lg border p-3">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
