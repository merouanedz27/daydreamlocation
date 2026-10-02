"use client";

import { useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { Category } from "@/lib/queries/stock";
import type { Locale } from "@/i18n/routing";

/**
 * Filtre par catégorie, porté par l'URL. La recherche (`?q=`) est dans
 * l'en-tête (`HeaderSearch`), commune à toutes les listes ; les deux se
 * combinent dans la même URL.
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
