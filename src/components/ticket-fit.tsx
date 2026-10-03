"use client";

import { useLayoutEffect, useRef } from "react";
import { PrintSheet } from "@/components/print-sheet";
import { cn } from "@/lib/utils";

/** 4 pouces en px CSS (96 px au pouce) : la largeur EXACTE de l'étiquette. */
const TICKET_WIDTH_PX = 384;

/** Le texte part de ce facteur et descend jusqu'à ce que tout tienne. */
const FIT_MAX = 1.35;
const FIT_MIN = 0.6;
const FIT_STEP = 0.95;
/** Quelques px de marge : le moteur d'impression arrondit autrement que l'écran. */
const FIT_SLACK_PX = 4;

/**
 * Ajuste la taille du texte d'un ticket pour qu'il REMPLISSE son étiquette
 * 4 × 6 sans jamais déborder : on part grand, on réduit par paliers.
 *
 * Toutes les tailles du ticket sont en `em` d'une seule taille racine,
 * `calc(10.5pt * var(--fit))` : un seul nombre à changer. Le ticket a une
 * hauteur FIXE (6 po) et `justify-center-safe` : ce qui dépasse dépasse vers
 * le bas, et `scrollHeight` le voit.
 *
 * Exporté pour `ticket-share.tsx`, qui le rejoue sur sa copie avant la photo.
 */
export function fitTicket(el: HTMLElement) {
  let fit = FIT_MAX;
  el.style.setProperty("--fit", String(fit));
  while (fit > FIT_MIN && el.scrollHeight > el.clientHeight - FIT_SLACK_PX) {
    fit = Math.max(FIT_MIN, fit * FIT_STEP);
    el.style.setProperty("--fit", fit.toFixed(3));
  }
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
        {children}
      </PrintSheet>
    </div>
  );
}
