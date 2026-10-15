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

/**
 * Le serveur envoie une requête POST à l'adresse de l'abonnement : elle doit
 * appartenir à un vrai service push (Chrome/Android, Firefox, Edge, Safari/iOS),
 * sinon un compte pourrait faire appeler n'importe quelle adresse au serveur.
 */
const PUSH_HOSTS = [
  "fcm.googleapis.com",
  "push.services.mozilla.com",
  "notify.windows.com",
  "push.apple.com",
];

function isPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      !url.port &&
      PUSH_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))
    );
  } catch {
    return false;
  }
}

export const pushSubscriptionSchema = z.object({
  locale: z.enum(EMAIL_LOCALES),
  endpoint: z.string().max(2048).refine(isPushEndpoint),
  p256dh: z.string().min(1).max(512),
  auth: z.string().min(1).max(512),
  user_agent: z.string().max(500).optional(),
});

export const notificationPrefsSchema = z.object({
  id: z.string().uuid(),
  notify_new_order: z.boolean(),
  notify_daily: z.boolean(),
  email_locale: z.enum(EMAIL_LOCALES),
});

export type TeamMessageInput = z.infer<typeof teamMessageSchema>;
