"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile, isOwner } from "@/lib/auth";
import { expenseSchema } from "@/lib/validation/expenses";
import { routing, type Locale } from "@/i18n/routing";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; field?: string };

function resolveLocale(value: FormDataEntryValue | null): Locale {
  return routing.locales.includes(value as Locale)
    ? (value as Locale)
    : routing.defaultLocale;
}

/**
 * Enregistre une dépense.
 *
 * Pas de RPC ici : une seule table, une seule ligne, rien à rendre atomique.
 * `expenses_owner_all` suffit côté base — mais le contrôle de rôle est refait
 * ici, une Server Action étant un point d'entrée réseau à part entière. RLS
 * refuserait de toute façon ; on veut un message propre plutôt qu'une erreur
 * Postgres brute.
 */
export async function createExpense(formData: FormData): Promise<ActionResult> {
  const locale = resolveLocale(formData.get("locale"));

  const profile = await getProfile();
  if (!isOwner(profile)) return { ok: false, error: "errors.forbidden" };

  const parsed = expenseSchema.safeParse({
    spent_on: formData.get("spent_on"),
    category: formData.get("category"),
    amount: formData.get("amount"),
    description: formData.get("description"),
    order_id: formData.get("order_id") ?? "",
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue.message, field: String(issue.path[0] ?? "") };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("expenses").insert({
    ...parsed.data,
    created_by: profile!.id,
  });

  if (error) return { ok: false, error: "errors.generic" };

  revalidatePath(`/${locale}/depenses`);
  revalidatePath(`/${locale}/tableau-de-bord`);
  return { ok: true };
}

/**
 * Supprime une dépense.
 *
 * Réservée au propriétaire, comme la saisie : une dépense effacée fausse le
 * bénéfice de tout un mois.
 */
export async function deleteExpense(formData: FormData): Promise<ActionResult> {
  const locale = resolveLocale(formData.get("locale"));

  const profile = await getProfile();
  if (!isOwner(profile)) return { ok: false, error: "errors.forbidden" };

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "errors.generic" };

  const supabase = await createClient();
  const { error } = await supabase.from("expenses").delete().eq("id", id);

  if (error) return { ok: false, error: "errors.generic" };

  revalidatePath(`/${locale}/depenses`);
  revalidatePath(`/${locale}/tableau-de-bord`);
  return { ok: true };
}
