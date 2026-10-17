import { z } from "zod";
import { localToInstant, normalizeTime } from "@/lib/pointage";

/** Messages = CLÉS i18n, jamais des phrases. Voir `daydream-i18n`. */

const time = z
  .string()
  .transform((v, ctx) => {
    const normalized = normalizeTime(v);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "pointage.errors.timeInvalid" });
      return z.NEVER;
    }
    return normalized;
  });

/**
 * Correction ou ajout d'une période par le propriétaire. La date et les heures
 * sont celles de la boutique ; on rend des instants prêts pour la base.
 *
 * Un départ « avant » l'arrivée passe au lendemain : une soirée de mariage
 * qui finit à 01:30 reste UNE période, rattachée au jour de l'arrivée.
 */
export const shiftSchema = z
  .object({
    id: z
      .union([z.literal(""), z.coerce.number().int().positive()])
      .optional()
      .transform((v) => (v === "" || v === undefined ? null : Number(v))),
    user_id: z.uuid({ message: "pointage.errors.memberRequired" }),
    work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "errors.dateInvalid" }),
    clock_in: time,
    clock_out: z.union([z.literal(""), time]),
    note: z
      .string()
      .trim()
      .max(200, { message: "errors.tooLong" })
      .optional()
      .transform((v) => (v ? v : null)),
  })
  .transform((v) => {
    const start = localToInstant(v.work_date, v.clock_in);
    let end: string | null = null;
    if (v.clock_out) {
      end = localToInstant(v.work_date, v.clock_out);
      if (end <= start) end = new Date(new Date(end).getTime() + 86_400_000).toISOString();
    }
    return { id: v.id, user_id: v.user_id, clock_in: start, clock_out: end, note: v.note };
  });

export type ShiftInput = z.infer<typeof shiftSchema>;
