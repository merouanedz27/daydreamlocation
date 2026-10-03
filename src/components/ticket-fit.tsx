"use client";

import { useLayoutEffect, useRef } from "react";
import { PrintSheet } from "@/components/print-sheet";
import { cn } from "@/lib/utils";

/** 4 pouces en px CSS (96 px au pouce) : la largeur EXACTE de l'étiquette. */
const TICKET_WIDTH_PX = 384;

/** Bornes du facteur de taille : la recherche garde le plus GRAND qui tient. */
const FIT_MAX = 2.2;
const FIT_MIN = 0.5;
const FIT_STEPS = 10;
/** Quelques px de marge : le moteur d'impression arrondit autrement que l'écran. */
const FIT_SLACK_PX = 6;

/**
 * Ajuste la taille du texte d'un ticket pour qu'il REMPLISSE son étiquette
 * 4 × 6 sans jamais déborder.
 *
 * Toutes les tailles du ticket — logos compris — sont en `em` d'une seule
 * taille racine, `calc(10.5pt * var(--fit))` : un seul nombre à changer. On
 * cherche par dichotomie le plus GRAND `--fit` pour lequel le contenu tient.
 *
 * On mesure le CONTENU (`[data-ticket-content]`, à sa hauteur naturelle) et
 * non la feuille : le `scrollHeight` d'une boîte n'est jamais inférieur à sa
 * hauteur visible — le comparer à elle disait « déborde » à tous les coups, et
 * le texte tombait toujours au minimum (tout petit au milieu de l'étiquette).
 *
 * Exporté pour `ticket-share.tsx`, qui le rejoue sur sa copie avant la photo.
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

/**
 * Un ticket du bon de location : une feuille de 4 × 6 pouces EXACTEMENT, à
 * l'écran comme sur le papier et dans le PDF — la même mise en page partout,
 * mesurée une seule fois.
 *
 * Sur un téléphone de 390 px, 4 pouces (384 px) ne tiennent pas avec les
 * marges : la feuille est RÉDUITE à l'affichage (`scale`, qui ne touche pas à
 * la mise en page), jamais reflowée. À l'impression, plus de réduction.
 */
export function TicketFrame({
  className,
  frameClassName,
  children,
}: {
  className?: string;
  /** Sur le cadre extérieur — le saut de page du 2ᵉ ticket. */
  frameClassName?: string;
  children: React.ReactNode;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const outer = frame.current;
    const ticket = sheet.current;
    if (!outer || !ticket) return;

    const rescale = () => {
      const available = outer.parentElement?.clientWidth ?? TICKET_WIDTH_PX;
      outer.style.setProperty("--s", String(Math.min(1, available / TICKET_WIDTH_PX)));
    };
    rescale();
    const observer = new ResizeObserver(rescale);
    if (outer.parentElement) observer.observe(outer.parentElement);

    // Logo et polices changent la hauteur : on remesure quand ils sont là.
    let alive = true;
    const refit = () => alive && fitTicket(ticket);
    refit();
    void document.fonts.ready.then(refit);
    for (const img of Array.from(ticket.querySelectorAll("img"))) {
      if (!img.complete) img.addEventListener("load", refit, { once: true });
    }
    window.addEventListener("beforeprint", refit);

    return () => {
      alive = false;
      observer.disconnect();
      window.removeEventListener("beforeprint", refit);
    };
  }, []);

  return (
    <div
      ref={frame}
      className={cn(
        "mx-auto flex h-[calc(6in*var(--s,1))] w-[calc(4in*var(--s,1))] justify-center",
        "print:block print:h-auto print:w-auto",
        frameClassName,
      )}
    >
      <PrintSheet
        ref={sheet}
        data-ticket
        style={{ fontSize: "calc(10.5pt * var(--fit, 1))" }}
        className={cn(
          // Encre noire sur blanc, même en thème sombre : c'est du papier.
          "print-ticket flex h-[6in] w-[4in] max-w-none shrink-0 flex-col justify-center-safe overflow-hidden bg-white p-[5mm] text-black sm:p-[5mm]",
          "origin-top [scale:var(--s,1)] print:p-[5mm] print:[scale:1]",
          // Arial comme son modèle ; l'arabe retombe sur Cairo si Arial n'a pas les glyphes.
          "font-[family-name:Arial,Helvetica,var(--font-cairo),sans-serif]",
          className,
        )}
      >
        {/* À sa hauteur NATURELLE (élément flex de la colonne, sans
            étirement) : c'est elle que `fitTicket` mesure. */}
        <div data-ticket-content className="w-full shrink-0">
          {children}
        </div>
      </PrintSheet>
    </div>
  );
}
