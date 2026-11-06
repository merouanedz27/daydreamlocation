/**
 * L'étiquette QR d'une retouche — module PUR, partagé par l'impression
 * (navigateur), le scanner de l'atelier et la page ouverte par l'appareil
 * photo du téléphone.
 *
 * Le QR porte une URL COMPLÈTE : scannée par l'appareil photo ordinaire, elle
 * ouvre la page de confirmation ; scannée dans l'application, on n'en garde
 * que l'id.
 */

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function isUuid(value: string): boolean {
  return new RegExp(`^${UUID.source}$`, "i").test(value);
}

/** `https://…/fr/atelier/p/<id>` — la langue de celui qui imprime. */
export function alterationUrl(origin: string, locale: string, id: string): string {
  return `${origin.replace(/\/+$/, "")}/${locale}/atelier/p/${id}`;
}

/**
 * L'id d'une retouche dans ce qu'a lu le scanner : l'URL de l'étiquette, ou
 * l'id seul tapé à la main. `null` pour tout autre QR (bon de location,
 * étiquette du stock…).
 */
export function alterationIdFrom(scanned: string): string | null {
  const value = scanned.trim();
  if (isUuid(value)) return value.toLowerCase();
  const match = /\/atelier\/p\/([0-9a-f-]{36})(?:[/?#]|$)/i.exec(value);
  return match && isUuid(match[1]) ? match[1].toLowerCase() : null;
}
