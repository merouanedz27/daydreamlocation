import { z } from "zod";

/** Messages = CLÉS i18n, jamais des phrases. Voir `daydream-i18n`. */

const optionalText = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((v) => (v ? v : null));

const money = z.coerce
  .number({ message: "errors.numberInvalid" })
  .min(0, { message: "errors.numberNegative" })
  .max(99_999_999);

export const modelSchema = z.object({
  ref_code: z
    .string()
    .trim()
    .min(1, { message: "errors.required" })
    .max(60)
    // Le code fournisseur du client (« Gio-079 ») sert de préfixe aux
    // références des pièces : on interdit ce qui gênerait cette dérivation.
    .regex(/^[A-Za-z0-9._\-/ ]+$/, { message: "errors.refCodeInvalid" }),
  name_fr: z.string().trim().min(1, { message: "errors.required" }).max(120),
  name_ar: optionalText,
  category_id: z.coerce.number().int().positive({ message: "errors.required" }),
  color: optionalText,
  brand: optionalText,
  description: optionalText,
  base_price: money,
  photo_path: z.string().trim().max(300).optional().nullable(),
});

export type ModelInput = z.infer<typeof modelSchema>;

export const unitSchema = z.object({
  model_id: z.coerce.number().int().positive(),
  size: optionalText,
  length_cm: z
    .union([z.literal(""), z.coerce.number().min(0).max(999)])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : Number(v))),
  price_override: z
    .union([z.literal(""), money])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : Number(v))),
  purchase_price: z
    .union([z.literal(""), money])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : Number(v))),
  condition: z.enum(["neuf", "bon", "use", "retire"]).default("bon"),
  /**
   * Nombre d'exemplaires à créer d'un coup.
   *
   * Le client achète souvent le même modèle en plusieurs tailles ou en
   * plusieurs exemplaires. Saisir la même fiche cinq fois au téléphone est
   * exactement le genre de corvée qui fait abandonner un outil.
   */
  quantity: z.coerce.number().int().min(1).max(20).default(1),
});

export type UnitInput = z.infer<typeof unitSchema>;
