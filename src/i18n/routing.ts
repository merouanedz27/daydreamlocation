import { defineRouting } from "next-intl/routing";

export const locales = ["fr", "ar"] as const;
export type Locale = (typeof locales)[number];

/** Sens d'écriture par locale — piloté par cette table, jamais deviné ailleurs. */
export const localeDirection: Record<Locale, "ltr" | "rtl"> = {
  fr: "ltr",
  ar: "rtl",
};

export const localeLabels: Record<Locale, string> = {
  fr: "Français",
  ar: "العربية",
};

/** Libellés courts de la bascule de langue — doivent tenir dans un bouton. */
export const localeShortLabels: Record<Locale, string> = {
  fr: "FR",
  ar: "عربي",
};

export const routing = defineRouting({
  locales,
  defaultLocale: "fr",
  // Le préfixe est toujours présent (/fr/..., /ar/...) : une URL partagée
  // entre deux membres de l'équipe garde la langue de celui qui l'envoie.
  localePrefix: "always",
});
