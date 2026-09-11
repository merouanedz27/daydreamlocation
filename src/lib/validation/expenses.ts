import { z } from "zod";

/** Messages = CLÉS i18n, jamais des phrases. Voir `daydream-i18n`. */

/** Doit rester aligné sur la contrainte `expenses_category_valid` en base. */
export const EXPENSE_CATEGORIES = [
  "achat_stock",
  "nettoyage",
  "retouche",
  "sous_location",
  "loyer",
  "salaire",
  "transport",
  "autre",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const expenseSchema = z.object({
  spent_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "errors.dateInvalid" }),
  category: z.enum(EXPENSE_CATEGORIES, { message: "errors.required" }),
  amount: z.coerce
    .number({ message: "errors.numberInvalid" })
    .min(0, { message: "errors.numberNegative" })
    .max(99_999_999),
  description: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((v) => (v ? v : null)),
  // Renseigné => « les frais » de cette commande (retouche, pressing).
  // Vide => charge générale (loyer, achat de stock).
  order_id: z
    .union([z.literal(""), z.coerce.number().int().positive()])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : Number(v))),
});

export type ExpenseInput = z.infer<typeof expenseSchema>;
