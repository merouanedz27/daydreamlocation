const BUCKET = "articles";

/**
 * URL publique d'une photo du stock.
 *
 * Le bucket est public en lecture : signer une URL par vignette ajouterait un
 * aller-retour par image dans des listes de plusieurs dizaines de pièces —
 * coûteux sur un téléphone en 3G, pour des photos de costumes qui n'ont rien
 * de confidentiel. L'écriture, elle, reste réservée à l'équipe (voir la
 * migration `storage`).
 */
export function photoUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return `${base}/storage/v1/object/public/${BUCKET}/${path}`;
}

export { BUCKET as PHOTO_BUCKET };
