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
