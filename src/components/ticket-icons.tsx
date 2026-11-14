import type { SVGProps } from "react";

/**
 * Les pictogrammes du bon de location que `lucide-react` n'a pas : cintre,
 * pantalon, veste, chaussure, nœud papillon — et les logos des
 * réseaux sociaux de la boutique (lucide a retiré les marques).
 *
 * Même grammaire que lucide (grille de 24, trait de 2, `currentColor`) : ils
 * se posent à côté des siens sans détonner. Encre seule, c'est du papier.
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

export const TrousersIcon = (p: P) => (
  <Icon {...p}>
    <path d="M6 3h12l1 18h-5l-2-11-2 11H5z" />
    <path d="M6 7h12" />
  </Icon>
);

export const JacketIcon = (p: P) => (
  <Icon {...p}>
    <path d="M8 3 3 6v15h18V6l-5-3" />
    <path d="m8 3 4 7 4-7" />
    <path d="M12 10v11" />
  </Icon>
);

export const ShoeIcon = (p: P) => (
  <Icon {...p}>
    <path d="M2 17v2h20v-1.5c0-1.5-1-2.5-3-3l-5-1.5-3-4H8l-1 2H4z" />
    <path d="M2 17h20" />
  </Icon>
);

export const BowTieIcon = (p: P) => (
  <Icon {...p}>
    <path d="M10.5 12 3 7.5v9zM13.5 12 21 7.5v9z" />
    <rect x="10.5" y="10" width="3" height="4" rx="1" fill="currentColor" />
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
