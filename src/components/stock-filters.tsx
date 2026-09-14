"use client";

import { useEffect, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search, X } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Category } from "@/lib/queries/stock";
import type { Locale } from "@/i18n/routing";

/**
 * Recherche + filtre par catégorie, portés par l'URL.
 *
 * L'état vit dans les paramètres d'URL et non dans un `useState` : un employé
 * peut ainsi envoyer « la liste des vestes taille 50 » à un collègue par un
 * simple lien, et le bouton retour du téléphone se comporte normalement.
 */
export function StockFilters({
  categories,
  locale,
}: {
  categories: Category[];
  locale: Locale;
}) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const activeCategory = params.get("categorie") ?? "";
  const [term, setTerm] = useState(params.get("q") ?? "");

  // Recherche différée : on ne relance pas une requête à chaque frappe.
  useEffect(() => {
    const current = params.get("q") ?? "";
    if (term === current) return;

    const timer = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (term.trim()) next.set("q", term.trim());
      else next.delete("q");
      startTransition(() => {
        router.replace(`${pathname}?${next}`);
      });
    }, 300);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  function selectCategory(slug: string) {
    const next = new URLSearchParams(params);
    if (slug) next.set("categorie", slug);
    else next.delete("categorie");
    startTransition(() => {
      router.replace(`${pathname}?${next}`);
    });
  }

  return (
    <div className={cn("space-y-3", isPending && "opacity-70")}>
      <div className="relative">
        <Search
          className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={t("common.search")}
          aria-label={t("common.search")}
          className="h-11 ps-10 pe-10 text-base"
        />
        {term && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setTerm("")}
            className="absolute end-1 top-1/2 size-9 -translate-y-1/2"
          >
            <X className="size-4" aria-hidden />
            <span className="sr-only">{t("common.cancel")}</span>
          </Button>
        )}
      </div>

      {/* Défilement horizontal : à 390 px, sept catégories ne tiennent pas
          sur une ligne et un menu déroulant coûterait un geste de plus. */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 max-md:scrollbar-none">
        <CategoryChip
          label={t("stock.allCategories")}
          active={!activeCategory}
          onClick={() => selectCategory("")}
        />
        {categories.map((c) => (
          <CategoryChip
            key={c.id}
            label={locale === "ar" ? c.name_ar : c.name_fr}
            active={activeCategory === c.slug}
            onClick={() => selectCategory(c.slug)}
          />
        ))}
      </div>
    </div>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "min-h-10 shrink-0 rounded-full border px-4 text-sm whitespace-nowrap transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground font-medium"
          : "border-border text-muted-foreground hover:bg-muted",
      )}
    >
      {label}
    </button>
  );
}
