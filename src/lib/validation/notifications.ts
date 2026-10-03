import { z } from "zod";

/** Messages = CLÉS i18n, jamais des phrases. Voir `daydream-i18n`. */

export const teamMessageSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(1, { message: "errors.required" })
    .max(150, { message: "errors.tooLong" }),
  body: z
    .string()
    .trim()
    .min(1, { message: "errors.required" })
    .max(5000, { message: "errors.tooLong" }),
  /** Vide = toute l'équipe. */
  recipients: z.array(z.string().uuid()).max(100),
});

export const EMAIL_LOCALES = ["fr", "ar"] as const;

export const notificationPrefsSchema = z.object({
  id: z.string().uuid(),
  notify_new_order: z.boolean(),
  notify_daily: z.boolean(),
  email_locale: z.enum(EMAIL_LOCALES),
});

export type TeamMessageInput = z.infer<typeof teamMessageSchema>;
