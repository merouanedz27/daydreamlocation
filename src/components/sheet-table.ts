/**
 * Classes du tableau « façon tableur », partagées par les commandes, le
 * stock et les dépenses. Un seul endroit décide de son allure :
 *
 *  - JAMAIS de défilement horizontal : `w-full`, cellules qui passent à la
 *    ligne, colonnes masquées par position sur écran étroit ;
 *  - `overflow-clip` (et non `overflow-auto`) arrondit les coins sans créer de
 *    conteneur de défilement : l'en-tête colle donc vraiment sous la barre du
 *    haut (`top-14`) quand on fait défiler la page ;
 *  - 13 px et marges serrées sur téléphone, lignes d'au moins 44 px.
 */
export const sheet = {
  wrapper: "border-border mt-4 overflow-clip rounded-lg border",
  table: "w-full text-[0.8125rem] sm:text-sm",
  headRow: "bg-muted sticky top-14 z-10",
  th: "text-muted-foreground border-border border-s px-1.5 py-1 align-bottom font-medium first:border-s-0 sm:px-3",
  /** Contenu d'un en-tête : zone de tap pleine hauteur. */
  thInner: "flex min-h-11 items-center gap-1",
  row: "border-border even:bg-muted/40 hover:bg-accent/60 cursor-pointer border-t transition-colors",
  td: "border-border border-s px-1.5 py-3 align-middle first:border-s-0 sm:px-3 md:py-2.5",
  /** Lien de la première cellule, qui porte le nom accessible de la ligne. */
  rowLink: "hover:text-gold-strong underline-offset-4 hover:underline",
} as const;
