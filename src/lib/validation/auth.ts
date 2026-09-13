import { z } from "zod";

/**
 * Les messages sont des CLÉS i18n, jamais des phrases : le formulaire est
 * affiché en français ou en arabe. Voir le skill `daydream-i18n`.
 */
export const signInSchema = z.object({
  email: z
    .string()
    .min(1, { message: "errors.emailRequired" })
    .email({ message: "errors.emailInvalid" }),
  password: z.string().min(1, { message: "errors.passwordRequired" }),
});

export type SignInInput = z.infer<typeof signInSchema>;

/**
 * Changer SON PROPRE mot de passe. Mêmes bornes que `resetPasswordSchema`
 * (`validation/team.ts`) : ≥ 8 pour GoTrue, ≤ 72 parce que bcrypt tronque.
 */
export const changePasswordSchema = z
  .object({
    current: z.string().min(1, { message: "errors.passwordRequired" }),
    password: z
      .string()
      .min(8, { message: "errors.passwordTooShort" })
      .max(72, { message: "errors.passwordTooLong" }),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "errors.passwordMismatch",
    path: ["confirm"],
  })
  .refine((v) => v.password !== v.current, {
    message: "errors.passwordSame",
    path: ["password"],
  });
