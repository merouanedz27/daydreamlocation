import { cn } from "@/lib/utils";

/**
 * Une feuille (A4 par défaut ; `className` change le format). À l'écran : une page blanche bordée, à la largeur du papier.
 * À l'impression : plus de bordure ni de marge propre — les marges du papier
 * sont celles de `@page` dans `globals.css`, et les doubler ferait perdre un
 * centimètre de chaque côté.
 *
 * Encre sur blanc, sans aplat de couleur : une impression noir et blanc de
 * boutique ne doit rien perdre, et un fond coloré vide une cartouche.
 */
export function PrintSheet({ className, children, ...props }: React.ComponentProps<"article">) {
  return (
    <article
      {...props}
      className={cn(
        "bg-background text-foreground border-border mx-auto max-w-[210mm] rounded-sm border p-5 text-sm sm:p-[12mm]",
        "print:max-w-none print:rounded-none print:border-0 print:p-0",
        className,
      )}
    >
      {children}
    </article>
  );
}
