/**
 * Les onglets de Paramètres — module PUR. Hors du fichier "use client" de
 * l'écran : une page serveur qui importe une VALEUR d'un module client ne
 * reçoit qu'une référence, pas le tableau.
 */
export const SETTINGS_TABS = ["boutique", "notifications", "emails"] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

export function parseSettingsTab(value: string | undefined): SettingsTab {
  return SETTINGS_TABS.includes(value as SettingsTab) ? (value as SettingsTab) : "boutique";
}
