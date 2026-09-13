import { getTranslations } from "next-intl/server";
import { Layers, Shirt } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * Modèles | Ensembles — deux vues du stock, deux vraies URL.
 *
 * Des liens et non des `Tabs` : chaque vue a sa propre adresse, se partage,
 * et le bouton retour du téléphone y ramène. Segment pleine largeur, 44 px.
 */
export async function StockTabs({ active }: { active: "models" | "ensembles" }) {
  const t = await getTranslations();

  const tabs = [
    { key: "models", href: "/stock", icon: Shirt, label: t("stock.tabModels") },
    { key: "ensembles", href: "/stock/ensembles", icon: Layers, label: t("stock.tabEnsembles") },
  ] as const;

  return (
    <nav
      aria-label={t("stock.title")}
      className="border-border bg-muted grid grid-cols-2 gap-1 rounded-lg border p-1"
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
  );
}
