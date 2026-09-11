"use client";

import { useParams } from "next/navigation";
import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Languages } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import {
  locales,
  localeLabels,
  localeShortLabels,
  type Locale,
} from "@/i18n/routing";
import { cn } from "@/lib/utils";

/**
 * Bascule FR / AR — UN SEUL bouton, qui annonce la langue vers laquelle on va.
 *
 * Avant : un segment à deux boutons, masqué sous `sm:` et recopié dans le menu
 * compte. Sur téléphone — l'appareil que l'équipe utilise toute la journée — la
 * langue était donc enterrée à deux taps. Ici le bouton est toujours visible et
 * un seul tap suffit.
 *
 * Suppose EXACTEMENT deux locales (cf. `locales`). Une troisième langue
 * demanderait un menu, pas une bascule.
 */
export function LocaleSwitcher({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const [isPending, startTransition] = useTransition();
  const t = useTranslations();

  const current = params.locale as Locale;
  const target = locales.find((l) => l !== current) ?? current;

  return (
    <button
      type="button"
      /* Jamais `disabled` : le bouton doit rester atteignable au clavier.
         `isPending` ne fait que griser. */
      aria-label={t("common.switchTo", { language: localeLabels[target] })}
      onClick={() =>
        startTransition(() => {
          // `usePathname` de `@/i18n/navigation` renvoie le chemin SANS préfixe
          // de locale ; `replace` le re-préfixe. On reste donc sur la page.
          router.replace(pathname, { locale: target });
        })
      }
      className={cn(
        "border-border bg-card hover:bg-muted focus-visible:ring-ring/50",
        "inline-flex min-h-11 items-center gap-2 rounded-full border px-4",
        "text-sm font-medium transition-colors focus-visible:ring-[3px] focus-visible:outline-none",
        isPending && "pointer-events-none opacity-60",
        className,
      )}
    >
      <Languages className="text-muted-foreground size-4 shrink-0" aria-hidden />
      {/* `lang` sur le libellé : sans lui, « عربي » s'afficherait dans la police
          latine au lieu de Tajawal. */}
      <span lang={target}>{localeShortLabels[target]}</span>
    </button>
  );
}
