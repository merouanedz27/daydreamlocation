import { z } from "zod";

/** Messages = CLÉS i18n, jamais des phrases. Voir `daydream-i18n`. */

/**
 * Un ensemble — « Costume n°12 ». Mêmes règles que `save_ensemble` en base :
 * un nom, au moins une pièce. La base les revérifie ; ici, on veut surtout
 * accrocher le message au bon champ.
 */
export const ensembleSchema = z.object({
  id: z
    .union([z.literal(""), z.coerce.number().int().positive()])
    .nullish()
    .transform((v) => (v === "" || v == null ? null : Number(v))),
  name: z
    .string({ message: "errors.required" })
    .trim()
    .min(1, { message: "errors.required" })
    .max(80, { message: "errors.textTooLong" }),
  description: z
    .string()
    .trim()
    .max(300, { message: "errors.textTooLong" })
    .nullish()
    .transform((v) => (v ? v : null)),
  // Facultatif : sans forfait, l'ensemble vaut la somme de ses pièces.
  package_price: z
    .union([
      z.literal(""),
      z.coerce
        .number({ message: "errors.numberInvalid" })
        .min(0, { message: "errors.numberNegative" })
        .max(99_999_999),
    ])
    .nullish()
    .transform((v) => (v === "" || v == null ? null : Number(v))),
  unit_ids: z
    .array(z.coerce.number().int().positive())
    .min(1, { message: "errors.ensembleUnitsRequired" })
    .max(50)
    .transform((ids) => [...new Set(ids)]),
});

export type EnsembleInput = z.infer<typeof ensembleSchema>;
