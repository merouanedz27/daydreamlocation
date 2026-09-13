import { z } from "zod";

/** Messages = CLÉS i18n, jamais des phrases. Voir `daydream-i18n`. */

/** Doit rester aligné sur la contrainte `profiles_role_valid` en base. */
export const MEMBER_ROLES = ["owner", "staff"] as const;

export type MemberRole = (typeof MEMBER_ROLES)[number];

/**
 * Le minimum doit rester ≥ à celui configuré dans GoTrue, sinon Zod laisse
 * passer un mot de passe que l'API d'administration refusera ensuite — et
 * l'erreur arriverait sans champ à surligner.
 *
 * Le maximum n'est pas décoratif : bcrypt TRONQUE silencieusement au-delà de
 * 72 octets. Mieux vaut refuser que laisser croire à un mot de passe long.
 */
const password = z
  .string()
  .min(8, { message: "errors.passwordTooShort" })
  .max(72, { message: "errors.passwordTooLong" });

export const createMemberSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, { message: "errors.required" })
    .max(80, { message: "errors.required" }),
  email: z.string().trim().toLowerCase().email({ message: "errors.emailInvalid" }),
  password,
  role: z.enum(MEMBER_ROLES, { message: "errors.required" }),
});

export const resetPasswordSchema = z.object({ password });

export type CreateMemberInput = z.infer<typeof createMemberSchema>;
