/** Bornes du facteur de taille : la recherche garde le plus GRAND qui tient. */
const FIT_MAX = 2.2;
const FIT_MIN = 0.5;
const FIT_STEPS = 10;
/** Quelques px de marge : le moteur d'impression arrondit autrement que l'écran. */
const FIT_SLACK_PX = 6;

/**
 * Ajuste la taille du texte d'un ticket pour qu'il REMPLISSE son étiquette
 * 4 × 6 sans jamais déborder. Navigateur seulement (mesure le DOM).
 *
 * Toutes les tailles du ticket — logos compris — sont en `em` d'une seule
 * taille racine, `calc(10.5pt * var(--fit))` : un seul nombre à changer. On
 * cherche par dichotomie le plus GRAND `--fit` pour lequel le contenu tient.
 *
 * On mesure le CONTENU (`[data-ticket-content]`, à sa hauteur naturelle) et
 * non la feuille : le `scrollHeight` d'une boîte n'est jamais inférieur à sa
 * hauteur visible — le comparer à elle disait « déborde » à tous les coups, et
 * le texte tombait toujours au minimum (tout petit au milieu de l'étiquette).
 */
export function fitTicket(el: HTMLElement) {
  const content = el.querySelector<HTMLElement>("[data-ticket-content]");
  if (!content) return;
  const style = getComputedStyle(el);
  const available =
    el.clientHeight -
    parseFloat(style.paddingTop) -
    parseFloat(style.paddingBottom) -
    FIT_SLACK_PX;

  const fits = (fit: number) => {
    el.style.setProperty("--fit", fit.toFixed(3));
    return (
      content.offsetHeight <= available &&
      // Un mot trop long pour la largeur déborderait sur le côté.
      content.scrollWidth <= content.clientWidth + 1
    );
  };

  let lo = FIT_MIN;
  let hi = FIT_MAX;
  if (fits(hi)) return;
  for (let i = 0; i < FIT_STEPS; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  el.style.setProperty("--fit", lo.toFixed(3));
}
