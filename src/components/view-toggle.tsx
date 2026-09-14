"use client";

import type { LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { LayoutList, Table2 } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type ListView = "list" | "table";

const OPTIONS: { value: ListView; icon: LucideIcon; label: string }[] = [
  { value: "list", icon: LayoutList, label: "common.viewList" },
  { value: "table", icon: Table2, label: "common.viewTable" },
];

/**
 * Bascule Liste / Tableau, commune aux commandes et au stock : même geste,
 * même place, mêmes icônes d'un écran à l'autre.
 *
 * Aucun bouton n'est enfoncé tant que l'affichage est inconnu (rendu
 * serveur) : mieux vaut rien que le mauvais.
 */
export function ViewToggle({
  view,
  onChange,
}: {
  view: ListView | null;
  onChange: (view: ListView) => void;
}) {
  const t = useTranslations();

  return (
    <ToggleGroup
      type="single"
      variant="outline"
      spacing={0}
      value={view ?? ""}
      // Radix renvoie "" quand on retape le bouton actif : on l'ignore, il
      // doit toujours rester un affichage sélectionné.
      onValueChange={(value) => {
        if (value === "list" || value === "table") onChange(value);
      }}
      aria-label={t("common.view")}
    >
      {OPTIONS.map(({ value, icon: Icon, label }) => (
        <ToggleGroupItem
          key={value}
          value={value}
          aria-label={t(label)}
          title={t(label)}
          className="data-[state=on]:bg-gold-soft data-[state=on]:text-foreground size-11"
        >
          <Icon aria-hidden />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
