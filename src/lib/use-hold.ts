"use client";

import { useRef } from "react";

/** Durée de l'appui long, comme la sélection de la liste des commandes. */
export const HOLD_MS = 500;

/**
 * Appui long sur une ligne → elle se SÉLECTIONNE. Ensuite, chaque toucher
 * coche ou décoche au lieu d'ouvrir la ligne. Le doigt qui glisse fait défiler
 * la liste : au-delà de quelques pixels, ce n'est plus un appui. Le « clic »
 * du relâché qui suit un appui long est avalé. Sur ordinateur, le clic droit
 * fait pareil.
 *
 * Partagé par le catalogue (modèles) et la fiche d'un modèle (pièces).
 */
export function useHold<T>(enabled: boolean, selecting: boolean, onHold: (item: T) => void) {
  const press = useRef<{ timer: number; x: number; y: number } | null>(null);
  const held = useRef(false);

  const cancel = () => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  };

  return (item: T) =>
    enabled
      ? {
          onPointerDown: (e: React.PointerEvent) => {
            if (e.pointerType === "mouse") return;
            cancel();
            held.current = false;
            const timer = window.setTimeout(() => {
              press.current = null;
              held.current = true;
              navigator.vibrate?.(30);
              onHold(item);
            }, HOLD_MS);
            press.current = { timer, x: e.clientX, y: e.clientY };
          },
          onPointerMove: (e: React.PointerEvent) => {
            const p = press.current;
            if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) cancel();
          },
          onPointerUp: cancel,
          onPointerCancel: cancel,
          onContextMenu: (e: React.MouseEvent) => {
            // Le menu natif (« Ouvrir dans un onglet »…) cède la place au nôtre.
            e.preventDefault();
            if (!held.current) onHold(item);
          },
          onClickCapture: (e: React.MouseEvent) => {
            if (held.current) {
              held.current = false;
              e.preventDefault();
              e.stopPropagation();
              return;
            }
            // En mode sélection, toucher la ligne coche — sauf la case elle-même,
            // qui se coche seule.
            if (selecting && !(e.target as HTMLElement).closest("label,input")) {
              e.preventDefault();
              e.stopPropagation();
              onHold(item);
            }
          },
        }
      : {};
}
