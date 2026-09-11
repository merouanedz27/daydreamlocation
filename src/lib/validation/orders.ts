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

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "errors.dateInvalid" });

/**
 * Une ligne de commande : SOIT une pièce du stock, SOIT une pièce sous-louée
 * chez un confrère (la colonne « FETHI LOC » du tableur). Jamais les deux.
 *
 * La base porte la même règle (`order_lines_unit_or_external`) : on la double
 * ici pour rendre un message lisible plutôt qu'une violation de contrainte.
 */
const unitLine = z.object({
  kind: z.literal("unit"),
  unitId: z.number().int().positive(),
  unitPrice: money,
  note: optionalText,
});

const externalLine = z.object({
  kind: z.literal("external"),
  source: optionalText,
  label: z.string().trim().min(1, { message: "errors.externalLabelRequired" }).max(200),
  cost: money.optional().nullable(),
  unitPrice: money,
  note: optionalText,
});

export const draftLineSchema = z.discriminatedUnion("kind", [unitLine, externalLine]);
export type DraftLineInput = z.infer<typeof draftLineSchema>;

export const orderSchema = z
  .object({
    customer_name: z
      .string()
      .trim()
      .min(1, { message: "errors.required" })
      .max(120),
    customer_phone: optionalText,
    event_date: isoDate,
    pickup_date: isoDate,
    return_due_date: isoDate,
    discount: money,
    amount_paid: money,
    caution_amount: money,
    notes: z.string().trim().max(1000).optional().transform((v) => (v ? v : null)),
    lines: z
      .array(draftLineSchema)
      .min(1, { message: "errors.linesRequired" })
      .max(50),
  })
  // Le schéma porte `orders_dates_coherent` ; on le vérifie ici aussi pour
  // pointer le champ fautif au lieu d'afficher une erreur Postgres.
  .refine((o) => o.return_due_date >= o.pickup_date, {
    message: "errors.datesIncoherent",
    path: ["return_due_date"],
  })
  // Deux fois la même pièce dans une commande : la contrainte d'exclusion la
  // refuserait (elle se chevauche elle-même), mais autant le dire clairement.
  .refine(
    (o) => {
      const ids = o.lines
        .filter((l): l is z.infer<typeof unitLine> => l.kind === "unit")
        .map((l) => l.unitId);
      return new Set(ids).size === ids.length;
    },
    { message: "errors.duplicateLine", path: ["lines"] },
  );

export type OrderInput = z.infer<typeof orderSchema>;
