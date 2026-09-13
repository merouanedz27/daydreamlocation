import { setRequestLocale } from "next-intl/server";
import { requireProfile } from "@/lib/auth";
import type { Locale } from "@/i18n/routing";

/**
 * Layout des documents IMPRIMABLES : bon de location, feuille du jour.
 *
 * Un groupe de routes à part, et non des classes `print:hidden` semées dans le
 * layout `(app)` : une feuille A4 n'a rien à faire d'un en-tête collant, d'une
 * barre d'onglets ou d'un pied de page, ni à l'écran ni sur le papier. Ce qui
 * s'affiche ici est ce qui s'imprime.
 *
 * Même garde que `(app)` — une session valide. La vraie protection reste RLS :
 * un document ne montre que ce que la base laisse lire.
 *
 * La langue, le sens d'écriture et les polices (Cairo, Inter) viennent du
 * layout `[locale]`, inchangé : un bon arabe s'imprime de droite à gauche,
 * avec la même police qu'à l'écran.
 */
export default async function PrintLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireProfile(locale as Locale);

  return (
    // À l'écran : la feuille blanche posée sur un fond légèrement teinté, pour
    // qu'on voie où s'arrête la page. À l'impression : plus de fond, plus de
    // marge — c'est `@page` (globals.css) qui fixe les marges du papier.
    <div className="bg-muted min-h-dvh px-4 py-4 print:min-h-0 print:bg-transparent print:p-0">
      {children}
    </div>
  );
}
