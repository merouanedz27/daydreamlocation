import type { SVGProps } from "react";

/**
 * Les pictogrammes du bon de location, en SILHOUETTES PLEINES comme la
 * maquette (`docs/NEW-DESIGN/`) : cintre, mètre, pantalon, ciseaux, chemise,
 * veste, chaussure, nœud papillon, étiquette, pièces — et les logos des
 * réseaux sociaux de la boutique (lucide a retiré les marques).
 *
 * Grille de 24, `currentColor` ; le blanc dessine les détails (revers,
 * œillets). Encre seule, c'est du papier.
 */
function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

type P = SVGProps<SVGSVGElement>;

export const HangerIcon = (p: P) => (
  <Icon {...p}>
    <path d="M10 5a2 2 0 1 1 2 2v1.5" />
    <path d="M12 8.5 2.8 16.2A1 1 0 0 0 3.4 18h17.2a1 1 0 0 0 .6-1.8z" />
  </Icon>
);

/* Silhouettes PLEINES, comme la maquette du bon (encre noire). */

export const TrousersIcon = (p: P) => (
  <Icon {...p} stroke="none" fill="currentColor">
    <path d="M6 2.5h12l1.2 19H14L12 10.5 10 21.5H4.8z" />
    <path d="M6.2 5.2h11.6" stroke="#fff" strokeWidth={0.9} />
  </Icon>
);

export const JacketIcon = (p: P) => (
  <Icon {...p} stroke="none" fill="currentColor">
    <path d="M8.2 2.5 3.5 5.2Q2.5 5.8 2.5 7v14h19V7q0-1.2-1-1.8l-4.7-2.7L12 11z" />
    <path
      d="m8.2 2.5 1.4 6.3-1.6 1.5 4 4.2m3.8-12L14.4 8.8l1.6 1.5-4 4.2V21.5"
      fill="none"
      stroke="#fff"
      strokeWidth={0.9}
    />
    <circle cx="12" cy="17" r="0.7" fill="#fff" />
  </Icon>
);

export const ShoeIcon = (p: P) => (
  <Icon {...p} stroke="none" fill="currentColor">
    <path d="M1.5 13.2q0-1.6 1.4-1.6 2.3 0 4.6-1.6l2.2-1.6 1.6 1.6 1.4-.8 1.2 1.4q2.5 1.2 6 1.7 2.6.4 2.6 2.4v.5H1.5z" />
    <path d="M1.5 16.6h21v1.2q0 .7-.7.7H6.5l-1-.6-.9.6H2.2q-.7 0-.7-.7z" />
  </Icon>
);

export const BowTieIcon = (p: P) => (
  <Icon {...p} stroke="none" fill="currentColor">
    <path d="M10.4 10.2 3 6.4Q2 6 2 7.2v9.6q0 1.2 1 .8l7.4-3.8zM13.6 10.2 21 6.4q1-.4 1 .8v9.6q0 1.2-1 .8l-7.4-3.8z" />
    <rect x="10" y="9.2" width="4" height="5.6" rx="1.2" />
  </Icon>
);

export const ShirtIcon = (p: P) => (
  <Icon {...p} stroke="none" fill="currentColor">
    <path d="M8.5 3 2 6.4l2.3 5.1 2.6-1.2V21h10.2V10.3l2.6 1.2L22 6.4 15.5 3q-1.2 1.8-3.5 1.8T8.5 3z" />
  </Icon>
);

/** Le mètre ruban enroulé, sa languette qui dépasse. */
export const TapeIcon = (p: P) => (
  <Icon {...p} stroke="none" fill="currentColor">
    <path d="M10 4.5c4.4 0 8 3.1 8 7v3.4h4V19H10c-4.4 0-8-3.4-8-7.3S5.6 4.5 10 4.5z" />
    <circle cx="10" cy="11.7" r="2.4" fill="#fff" />
    <path
      d="M19 15v1.6M20.6 15v2.4"
      stroke="#fff"
      strokeWidth={0.7}
    />
  </Icon>
);

export const ScissorsIcon = (p: P) => (
  <Icon {...p} strokeWidth={2.4}>
    <circle cx="6" cy="6" r="3" fill="currentColor" />
    <circle cx="6" cy="18" r="3" fill="currentColor" />
    <circle cx="6" cy="6" r="1.1" fill="#fff" stroke="none" />
    <circle cx="6" cy="18" r="1.1" fill="#fff" stroke="none" />
    <path d="M8.1 8.1 21 19M8.1 15.9 21 5" />
  </Icon>
);

/** L'étiquette de prix, son œillet. */
export const TagIcon = (p: P) => (
  <Icon {...p} stroke="none" fill="currentColor">
    <path d="M2.5 3.8q0-1.3 1.3-1.3h7.4q.6 0 1 .4l9.3 9.3q.9.9 0 1.8l-7.4 7.4q-.9.9-1.8 0l-9.4-9.3q-.4-.4-.4-1z" />
    <circle cx="7.4" cy="7.4" r="1.8" fill="#fff" />
  </Icon>
);

/** La pile de pièces : le prix. */
export const CoinsIcon = (p: P) => (
  <Icon {...p} stroke="none" fill="currentColor">
    <ellipse cx="12" cy="5" rx="7.5" ry="2.6" />
    {[8.6, 12.2, 15.8, 19.4].map((y) => (
      <path
        key={y}
        d={`M4.5 ${y - 2.2}v1.6c0 1.4 3.4 2.6 7.5 2.6s7.5-1.2 7.5-2.6v-1.6c-1.5 1.1-4.3 1.7-7.5 1.7s-6-.6-7.5-1.7z`}
      />
    ))}
  </Icon>
);

export const InstagramIcon = (p: P) => (
  <Icon {...p}>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
  </Icon>
);

export const TiktokIcon = (p: P) => (
  <Icon {...p} stroke="none" fill="currentColor">
    <path d="M16.2 2.5c.3 2.3 1.8 3.9 4.1 4.1v3.2a7 7 0 0 1-4-1.3v6.3a6.3 6.3 0 1 1-6.3-6.3h.5v3.3a3 3 0 1 0 2.4 2.9V2.5z" />
  </Icon>
);

export const FacebookIcon = (p: P) => (
  <Icon {...p} stroke="none">
    <circle cx="12" cy="12" r="10" fill="currentColor" />
    <path
      fill="#fff"
      d="M13.4 22v-7.5h2.4l.4-2.8h-2.8V9.9c0-.8.3-1.4 1.4-1.4h1.5V6a19 19 0 0 0-2.2-.1c-2.2 0-3.6 1.3-3.6 3.7v2.1H8.1v2.8h2.4V22z"
    />
  </Icon>
);
