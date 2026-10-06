"use client";

// Le chemin BRUT suffit (on cherche « /imprimer », locale comprise) — et ce
// fournisseur est monté hors de NextIntlClientProvider, dont dépend la version
// de `@/i18n/navigation`.
// eslint-disable-next-line no-restricted-imports
import { usePathname } from "next/navigation";
import { ThemeProvider as NextThemes } from "next-themes";

/**
 * Thème clair / sombre, réglé PAR APPAREIL (localStorage) — « Auto » suit le
 * téléphone. Le script de next-themes pose la classe `.dark` avant le premier
 * rendu : pas d'éclair blanc au chargement.
 *
 * Les DOCUMENTS (bon de location, feuille du jour) restent TOUJOURS clairs :
 * l'imprimante thermique et le PDF partagé veulent du noir sur blanc, quel que
 * soit le réglage du téléphone.
 */
/**
 * Le script anti-éclair ne sert qu'au PREMIER chargement, rendu par le
 * serveur. Côté client (changement de langue : la mise en page `[locale]` se
 * refait), React 19 refuse un <script> exécutable et le signale en console.
 * Un type non exécutable le fait taire ; next-themes pose déjà
 * `suppressHydrationWarning` sur la balise, l'écart de type est donc admis.
 */
const scriptProps =
  typeof window === "undefined" ? undefined : ({ type: "application/json" } as const);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const printing = pathname.includes("/imprimer");

  return (
    <NextThemes
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      forcedTheme={printing ? "light" : undefined}
      scriptProps={scriptProps}
    >
      {children}
    </NextThemes>
  );
}
