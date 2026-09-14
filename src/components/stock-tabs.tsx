import { getTranslations } from "next-intl/server";
import { Layers, Plus, Shirt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * Modèles | Ensembles — deux vues du stock, deux vraies URL.
 *
 * Des liens et non des `Tabs` : chaque vue a sa propre adresse, se partage,
 * et le bouton retour du téléphone y ramène. Segment pleine largeur, 44 px.
 *
 * `action` : le bouton de création de l'onglet (« Nouveau modèle », « Nouvel
 * ensemble »). Il vit ICI pour occuper la même place sur les deux onglets —
 * au bout de la barre, à toutes les largeurs. Sur téléphone, un « + » de
 * 44 px : le libellé complet écraserait les deux onglets.
 */
export async function StockTabs({
  active,
  action,
}: {
  active: "models" | "ensembles";
  action?: { href: string; label: string };
}) {
  const t = await getTranslations();

  const tabs = [
    { key: "models", href: "/stock", icon: Shirt, label: t("stock.tabModels") },
    { key: "ensembles", href: "/stock/ensembles", icon: Layers, label: t("stock.tabEnsembles") },
  ] as const;

  return (
    <div className="flex items-stretch gap-2">
      <nav
        aria-label={t("stock.title")}
        className="border-border bg-muted grid flex-1 grid-cols-2 gap-1 rounded-lg border p-1"
      >
        {tabs.map(({ key, href, icon: Icon, label }) => {
          const current = key === active;
          return (
            <Link
              key={key}
              href={href}
              aria-current={current ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center justify-center gap-2 rounded-md text-sm transition-colors",
                current
                  ? "bg-background text-foreground border-border border font-medium"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className={cn("size-4", current && "text-gold-strong")} aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>

      {action && (
        <Button asChild className="h-auto min-w-13 shrink-0 px-3 sm:px-4">
          <Link href={action.href} aria-label={action.label} title={action.label}>
            <Plus className="size-5" aria-hidden />
            <span className="hidden sm:inline">{action.label}</span>
          </Link>
        </Button>
      )}
    </div>
  );
}
