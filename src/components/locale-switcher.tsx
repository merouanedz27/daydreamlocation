"use client";

import { useParams } from "next/navigation";
import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Languages } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { locales, localeLabels, type Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/**
 * Bascule FR / AR — UN SEUL bouton, réduit à son icône.
 *
 * Avant : un segment à deux boutons, masqué sous `sm:` et recopié dans le menu
 * compte. Sur téléphone — l'appareil que l'équipe utilise toute la journée — la
 * langue était donc enterrée à deux taps. Ici le bouton est toujours visible et
 * un seul tap suffit.
 *
 * L'icône seule ne dit plus vers QUELLE langue on bascule : `aria-label` et
 * `title` portent donc la phrase complète (« Passer en arabe »), pour
 * l'infobulle au survol comme pour le lecteur d'écran. C'est le compromis
 * assumé de l'icône seule.
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
  const label = t("common.switchTo", { language: localeLabels[target] });

  return (
    <button
      type="button"
      /* Jamais `disabled` : le bouton doit rester atteignable au clavier.
         `isPending` ne fait que griser. */
      aria-label={label}
      title={label}
      onClick={() =>
        startTransition(() => {
          // `usePathname` de `@/i18n/navigation` renvoie le chemin SANS préfixe
          // de locale ; `replace` le re-préfixe. On reste donc sur la page.
          router.replace(pathname, { locale: target });
        })
      }
      className={cn(
        // Couleurs par DÉFAUT, valables sur la page de connexion (fond blanc).
        // L'en-tête, dont la barre est brune, les remplace par `className`.
        "border-border bg-card text-muted-foreground hover:bg-muted focus-visible:ring-ring/50",
        // La cible tactile reste à 44 px même si le visuel a rétréci.
        "inline-flex size-11 items-center justify-center rounded-full border",
        "transition-colors focus-visible:ring-[3px] focus-visible:outline-none",
        isPending && "pointer-events-none opacity-60",
        className,
      )}
    >
      <Languages className="size-5 shrink-0" aria-hidden />
    </button>
  );
}
