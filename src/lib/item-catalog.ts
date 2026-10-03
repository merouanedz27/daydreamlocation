/**
 * Les listes de vêtements de la saisie rapide — module PUR.
 *
 * Ce sont les listes « Enum » de son AppSheet, recopiées telles quelles : la
 * case COSTUME propose les tenues, la case CHAUSSURES les chaussures, dans SON
 * ordre (pas l'ordre alphabétique : « Jabador S, M, L, XL » se lit ainsi).
 *
 * Elles REMPLACENT les libellés appris des anciennes commandes, qui
 * proposaient toutes les variantes déjà tapées (fautes comprises). Un libellé
 * hors liste reste saisissable à la main.
 */

export const COSTUME_ITEMS = [
  "Tuxedo A avec Gelly A", "Tuxedo A avec Gelly B", "Tuxedo A avec Gelly C", "Tuxedo A avec Gelly D", "Tuxedo A avec Gelly E", "Tuxedo A avec Gelly F", "Tuxedo A avec Gelly G",
  "Tuxedo B avec Gelly A", "Tuxedo B avec Gelly B", "Tuxedo B avec Gelly C", "Tuxedo B avec Gelly D", "Tuxedo B avec Gelly E", "Tuxedo B avec Gelly F", "Tuxedo B avec Gelly G",
  "Tuxedo C avec Gelly A", "Tuxedo C avec Gelly B", "Tuxedo C avec Gelly C", "Tuxedo C avec Gelly D", "Tuxedo C avec Gelly E", "Tuxedo C avec Gelly F", "Tuxedo C avec Gelly G",
  "Tuxedo D avec Gelly A", "Tuxedo D avec Gelly B", "Tuxedo D avec Gelly C", "Tuxedo D avec Gelly D", "Tuxedo D avec Gelly E", "Tuxedo D avec Gelly F", "Tuxedo D avec Gelly G",
  "Tuxedo E avec Gelly A", "Tuxedo E avec Gelly B", "Tuxedo E avec Gelly C", "Tuxedo E avec Gelly D", "Tuxedo E avec Gelly E", "Tuxedo E avec Gelly F", "Tuxedo E avec Gelly G",
  "Tuxedo F avec Gelly A", "Tuxedo F avec Gelly B", "Tuxedo F avec Gelly C", "Tuxedo F avec Gelly D", "Tuxedo F avec Gelly E", "Tuxedo F avec Gelly F", "Tuxedo F avec Gelly G",
  "Tuxedo G avec Gelly A", "Tuxedo G avec Gelly B", "Tuxedo G avec Gelly C", "Tuxedo G avec Gelly D", "Tuxedo G avec Gelly E", "Tuxedo G avec Gelly F", "Tuxedo G avec Gelly G",
  "Invite Beige Simple",
  "Invite Blue Nuit Croise",
  "Invite Vert Croise",
  "Invite Noir Simple",
  "Invite Blue Arriere",
  "Invite Gris",
  "Invite Greuna",
  "Pantalon A",
  "Pantalon B",
  "Pantalon C",
  "Pantalon D",
  "Pantalon E",
  "Pantalon F",
  "Pantalon G",
  "Pantalon Invite Beige Simple", "Pantalon Invite Blue Nuit Croise", "Pantalon Invite Vert Croise", "Pantalon Invite Noir Simple", "Pantalon Invite Blue Arriere", "Pantalon Invite Gris", "Pantalon Invite Greuna",
  "Jabador S - Grenat", "Jabador S - Grenat avec Beige", "Jabador S - Beige", "Jabador S - Vert",
  "Jabador M - Grenat", "Jabador M - Grenat avec Beige", "Jabador M - Beige", "Jabador M - Vert",
  "Jabador L - Grenat", "Jabador L - Grenat avec Beige", "Jabador L - Beige", "Jabador L - Vert",
  "Jabador XL - Grenat", "Jabador XL - Grenat avec Beige", "Jabador XL - Beige", "Jabador XL - Vert",
  "Barnous Dore", "Barnous Dore Max",
] as const;

export const SHOE_ITEMS = [
  "Cordon Mat 39", "Cordon Mat 40", "Cordon Mat 41", "Cordon Mat 42", "Cordon Mat 43", "Cordon Mat 44",
  "Cordon Glacé Simple 39", "Cordon Glacé Simple 40", "Cordon Glacé Simple 41", "Cordon Glacé Simple 42", "Cordon Glacé Simple 43", "Cordon Glacé Simple 44",
  "Cordon Glacé Arrière 39", "Cordon Glacé Arrière 40", "Cordon Glacé Arrière 41", "Cordon Glacé Arrière 42", "Cordon Glacé Arrière 43", "Cordon Glacé Arrière 44",
  "Achv Argent 39", "Achv Argent 40", "Achv Argent 41", "Achv Argent 42", "Achv Argent 43", "Achv Argent 44",
  "Achv Doré 39", "Achv Doré 40", "Achv Doré 41", "Achv Doré 42", "Achv Doré 43", "Achv Doré 44",
  "Achv Marron Foncé 39", "Achv Marron Foncé 40", "Achv Marron Foncé 41", "Achv Marron Foncé 42", "Achv Marron Foncé 43", "Achv Marron Foncé 44",
  "Achv Marron Clair 39", "Achv Marron Clair 40", "Achv Marron Clair 41", "Achv Marron Clair 42", "Achv Marron Clair 43", "Achv Marron Clair 44",
  "Achv Demi Mat 39", "Achv Demi Mat 40", "Achv Demi Mat 41", "Achv Demi Mat 42", "Achv Demi Mat 43", "Achv Demi Mat 44",
  "Bligha Beige 40", "Bligha Beige 41", "Bligha Beige 42", "Bligha Beige 43", "Bligha Beige 44", "Bligha Beige 45", "Bligha Beige 46", "Bligha Beige 47", "Bligha Beige 48", "Bligha Beige 49",
  "Bligha Blanc 40", "Bligha Blanc 41", "Bligha Blanc 42", "Bligha Blanc 43", "Bligha Blanc 44", "Bligha Blanc 45", "Bligha Blanc 46", "Bligha Blanc 47", "Bligha Blanc 48", "Bligha Blanc 49",
  "Bligha Jaune 40", "Bligha Jaune 41", "Bligha Jaune 42", "Bligha Jaune 43", "Bligha Jaune 44", "Bligha Jaune 45", "Bligha Jaune 46", "Bligha Jaune 47", "Bligha Jaune 48", "Bligha Jaune 49",
] as const;
