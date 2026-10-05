"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

const CHOICES = [
  { value: "light", icon: Sun, key: "theme.light" },
  { value: "dark", icon: Moon, key: "theme.dark" },
  { value: "system", icon: Monitor, key: "theme.system" },
] as const;

const subscribe = () => () => {};

/**
 * Clair / Sombre / Auto — trois boutons côte à côte, au pouce. Le choix vit
 * sur l'APPAREIL : chaque employé règle son propre téléphone.
 */
export function ThemeChoice({
  className,
  compact = false,
}: {
  className?: string;
  /**
   * Menu du bureau, étroit : l'icône AU-DESSUS du mot, en petit — côte à
   * côte, les trois ne tenaient pas dans la largeur et l'icône débordait.
   */
  compact?: boolean;
}) {
  const t = useTranslations();
  const { theme, setTheme } = useTheme();
  // Le thème enregistré n'est connu qu'au navigateur : rien de coché au rendu
  // serveur, sinon l'hydratation se plaindrait.
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const current = mounted ? (theme ?? "system") : null;

  return (
    <div
      role="radiogroup"
      aria-label={t("theme.title")}
      className={cn("bg-muted grid grid-cols-3 gap-1 rounded-lg p-1", className)}
    >
      {CHOICES.map(({ value, icon: Icon, key }) => {
        const active = current === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(value)}
            className={cn(
              "flex min-h-11 min-w-0 items-center justify-center overflow-hidden rounded-md transition-colors",
              compact ? "flex-col gap-0.5 px-1 py-1.5 text-xs" : "gap-1.5 px-2 text-sm",
              active
                ? "bg-background text-foreground font-medium shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            <span className="max-w-full truncate">{t(key)}</span>
          </button>
        );
      })}
    </div>
  );
}
