import { z } from "zod";

/** Messages = CLÉS i18n, jamais des phrases. Voir `daydream-i18n`. */

/**
 * Texte facultatif d'un formulaire, borné comme en base
 * (`settings_shop_lengths`). Vide → `null` : le bloc correspondant ne
 * s'imprime pas sur le bon.
 */
const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { message: "errors.textTooLong" })
    .nullish()
    .transform((v) => (v ? v : null));

export const shopSettingsSchema = z.object({
  shop_address: optional(300),
  shop_phone: optional(40),
  rental_terms_fr: optional(3000),
  rental_terms_ar: optional(3000),
});

export type ShopSettingsInput = z.infer<typeof shopSettingsSchema>;
