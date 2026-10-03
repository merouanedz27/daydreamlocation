"use client";

import { useLayoutEffect, useRef } from "react";
import { PrintSheet } from "@/components/print-sheet";
import { useTicketPdf } from "@/components/ticket-pdf";
import { fitTicket } from "@/lib/fit-ticket";
import { cn } from "@/lib/utils";

/** 4 pouces en px CSS (96 px au pouce) : la largeur EXACTE de l'étiquette. */
const TICKET_WIDTH_PX = 384;

/**
 * Un ticket du bon de location : une feuille de 4 × 6 pouces EXACTEMENT.
 *
 * Deux états :
 * 1. à l'ouverture, la mise en page vivante (texte ajusté par `fitTicket`) ;
 * 2. dès que `TicketPdfProvider` l'a photographiée, c'est la PHOTO qui
 *    s'affiche et qui s'imprime — la même image que la page du PDF partagé.
 *    L'aperçu à l'écran est donc exactement ce que l'appli de l'imprimante
 *    recevra, et le papier aussi.
 *
 * À l'impression, la photo prend TOUTE la page (`100vw × 100vh`, sans
 * déformation) : sur la page 4 × 6 demandée, elle la couvre pile ; si le
 * téléphone impose un autre papier, elle s'y ajuste au lieu de déborder.
 *
 * Sur un téléphone de 390 px, 4 pouces (384 px) ne tiennent pas avec les
 * marges : la feuille est RÉDUITE à l'affichage (`scale`), jamais reflowée.
 */
export function TicketFrame({
  index,
  className,
  frameClassName,
  children,
}: {
  /** Rang du ticket dans la page : sa photo dans le PDF. */
  index: number;
  className?: string;
  /** Sur le cadre extérieur — le saut de page du 2ᵉ ticket. */
  frameClassName?: string;
  children: React.ReactNode;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLElement>(null);
  const photo = useTicketPdf().images?.[index] ?? null;

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

    return () => {
      alive = false;
      observer.disconnect();
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
      <div
        className={cn(
          "print-ticket relative h-[6in] w-[4in] shrink-0 origin-top [scale:var(--s,1)]",
          "print:[scale:1]",
          // La photo à l'impression : toute la page, proportions gardées.
          photo && "print:h-screen print:w-screen",
        )}
      >
        <PrintSheet
          ref={sheet}
          data-ticket
          style={{ fontSize: "calc(10.5pt * var(--fit, 1))" }}
          className={cn(
            // Encre noire sur blanc, même en thème sombre : c'est du papier.
            "flex h-[6in] w-[4in] max-w-none flex-col justify-center-safe overflow-hidden bg-white p-[5mm] text-black sm:p-[5mm] print:p-[5mm]",
            // Arial comme son modèle ; l'arabe retombe sur Cairo si Arial n'a pas les glyphes.
            "font-[family-name:Arial,Helvetica,var(--font-cairo),sans-serif]",
            // Photographiée : la mise en page vivante reste en place mais ne
            // se voit ni ne s'imprime plus.
            photo && "invisible print:hidden",
            className,
          )}
        >
          {/* À sa hauteur NATURELLE (élément flex de la colonne, sans
              étirement) : c'est elle que `fitTicket` mesure. */}
          <div data-ticket-content className="w-full shrink-0">
            {children}
          </div>
        </PrintSheet>

        {photo && (
          // La photo de la page elle-même (adresse `blob:` locale) : rien à
          // optimiser pour `next/image`.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt=""
            className="border-border absolute inset-0 size-full rounded-sm border bg-white object-contain print:static print:rounded-none print:border-0 print:[print-color-adjust:exact]"
          />
        )}
      </div>
    </div>
  );
}
