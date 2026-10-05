"use client";

import { memo } from "react";
import { useSearchParams } from "next/navigation";
import { highlightParts } from "@/lib/search";

/**
 * Un texte, le terme `q` SURLIGNÉ — sans casse ni accents, texte d'origine
 * intact. Sert aux recherches LOCALES (listes à cocher de la saisie, choix
 * d'une pièce) qui gardent leur terme dans un état React.
 *
 * Mémoïsé : une ligne ne se redessine que si son texte ou le terme change. Une
 * ligne sans correspondance rend sa chaîne nue, sans aucun élément en plus.
 */
export const HighlightText = memo(function HighlightText({
  text,
  q,
}: {
  text: string | null | undefined;
  q: string | null | undefined;
}) {
  if (!text) return null;
  const parts = highlightParts(text, q);
  if (parts.length === 1 && !parts[0].hit) return <>{text}</>;
  return (
    <>
      {parts.map((part, i) =>
        part.hit ? (
          <mark
            key={i}
            className="bg-highlight text-foreground rounded-sm px-0.5 font-semibold box-decoration-clone"
          >
            {part.text}
          </mark>
        ) : (
          part.text
        ),
      )}
    </>
  );
});

/**
 * Le même, avec le terme de la recherche de l'EN-TÊTE (`?q=` dans l'URL) :
 * aucune liste n'a à faire descendre le terme jusqu'à ses cellules, et effacer
 * la recherche efface les surlignages.
 */
export function Highlight({ text }: { text: string | null | undefined }) {
  const q = useSearchParams().get("q");
  return <HighlightText text={text} q={q} />;
}
