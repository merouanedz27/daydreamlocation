import { z } from "zod";

/** Messages = CLÉS i18n, jamais des phrases. Voir `daydream-i18n`. */

/**
 * Texte facultatif venant d'un FORMULAIRE.
 *
 * `.nullish()`, surtout pas `.optional()` seul : un champ ABSENT du formulaire
 * donne `formData.get(...) === null`, et non `undefined`. Zod rejetait donc le
 * schéma entier sur un champ que l'employé ne voit même pas — c'est ce qui
 * empêchait toute création de modèle, `description` n'existant pas dans le
 * formulaire. L'échec était de surcroît muet : le champ nommé dans l'erreur
 * n'ayant pas de place à l'écran, rien ne s'affichait.
 */
const optionalText = z
  .string()
  .trim()
  .max(200)
  .nullish()
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
  /**
   * La SÉRIE de tailles cochées : une pièce par taille (46, 48, 50 → trois
   * pièces). Vide = `quantity` pièces sans taille.
   */
  sizes: z.array(z.string().trim().min(1).max(20)).max(20).default([]),
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

/** Modification d'une pièce existante : sa taille, sa longueur, son prix. */
export const unitUpdateSchema = z.object({
  id: z.coerce.number().int().positive(),
  size: optionalText,
  length_cm: z
    .union([z.literal(""), z.coerce.number().min(0).max(999)])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : Number(v))),
  price_override: z
    .union([z.literal(""), money])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : Number(v))),
});

/**
 * Modification d'un modèle : les mêmes règles que la création, plus l'`id`.
 *
 * On repart volontairement du MÊME schéma. Une modification qui accepterait ce
 * que la création refuse (une référence vide, un prix négatif) laisserait
 * entrer par la porte de derrière exactement ce qu'on garde dehors.
 */
export const modelUpdateSchema = modelSchema.extend({
  id: z.coerce.number().int().positive(),
});

export type ModelUpdateInput = z.infer<typeof modelUpdateSchema>;
