"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { orderSchema } from "@/lib/validation/orders";
import { getSettings, getUnavailableUnits, type Unavailability } from "@/lib/queries/orders";
import { redirectTo } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; field?: string; values?: Record<string, string> };

function resolveLocale(value: FormDataEntryValue | null): Locale {
  return routing.locales.includes(value as Locale)
    ? (value as Locale)
    : routing.defaultLocale;
}

/** Violation de la contrainte d'exclusion : une pièce est déjà réservée. */
const EXCLUSION_VIOLATION = "23P01";

/**
 * Disponibilité des pièces sur une fenêtre — pour GRISER, pas pour décider.
 *
 * Appelée quand l'employé change les dates. Le verdict final appartient à la
 * base : entre cet affichage et la validation, un collègue peut réserver la
 * même veste depuis un autre téléphone.
 */
export async function checkAvailability(
  pickup: string,
  returnDue: string,
): Promise<Unavailability[]> {
  const profile = await getProfile();
  if (!profile) return [];

  const settings = await getSettings();
  return getUnavailableUnits(pickup, returnDue, settings.cleaning_buffer_days);
}

/**
 * Crée une commande et toutes ses lignes.
 *
 * Passe par la fonction SQL `create_order` et non par deux appels successifs :
 * une commande dont la 3ᵉ pièce est déjà louée ne doit rien laisser derrière
 * elle. Voir `supabase/migrations/20260911120000_create_order_rpc.sql`.
 *
 * Le contrôle de rôle est refait ici : une Server Action est un point d'entrée
 * réseau à part entière. La RLS refuserait de toute façon, mais on veut un
 * message propre plutôt qu'une erreur Postgres brute.
 */
export async function createOrder(formData: FormData): Promise<ActionResult> {
  const locale = resolveLocale(formData.get("locale"));

  const profile = await getProfile();
  // Créer une commande est le métier quotidien de l'équipe : `staff` suffit.
  if (!profile) return { ok: false, error: "errors.forbidden" };

  let lines: unknown;
  try {
    lines = JSON.parse(String(formData.get("lines") ?? "[]"));
  } catch {
    return { ok: false, error: "errors.generic" };
  }

  const parsed = orderSchema.safeParse({
    customer_name: formData.get("customer_name"),
    customer_phone: formData.get("customer_phone"),
    event_date: formData.get("event_date"),
    pickup_date: formData.get("pickup_date"),
    return_due_date: formData.get("return_due_date"),
    discount: formData.get("discount") || 0,
    amount_paid: formData.get("amount_paid") || 0,
    caution_amount: formData.get("caution_amount") || 0,
    notes: formData.get("notes"),
    lines,
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue.message, field: String(issue.path[0] ?? "") };
  }

  const input = parsed.data;
  const supabase = await createClient();

  const { data: orderId, error } = await supabase.rpc("create_order", {
    p_customer_name: input.customer_name,
    p_customer_phone: input.customer_phone ?? "",
    p_event_date: input.event_date,
    p_pickup_date: input.pickup_date,
    p_return_due_date: input.return_due_date,
    p_discount: input.discount,
    p_amount_paid: input.amount_paid,
    p_caution_amount: input.caution_amount,
    p_notes: input.notes ?? "",
    p_lines: input.lines.map((l) =>
      l.kind === "unit"
        ? { unitId: l.unitId, unitPrice: l.unitPrice, note: l.note ?? "" }
        : {
            source: l.source ?? "",
            label: l.label,
            cost: l.cost ?? "",
            unitPrice: l.unitPrice,
            note: l.note ?? "",
          },
    ),
  });

  if (error) {
    // `create_order` retraduit la violation d'exclusion en nommant la pièce :
    // « Gio-079-01 est déjà réservée » se corrige, « 23P01 » non.
    const named = /unit_unavailable:(.+)$/.exec(error.message);
    if (named || error.code === EXCLUSION_VIOLATION) {
      return named
        ? {
            ok: false,
            error: "errors.unitUnavailableNamed",
            values: { ref: named[1].trim() },
          }
        : { ok: false, error: "errors.unitUnavailable" };
    }
    if (error.message.includes("lines_required")) {
      return { ok: false, error: "errors.linesRequired" };
    }
    if (error.message.includes("external_label_required")) {
      return { ok: false, error: "errors.externalLabelRequired" };
    }
    if (error.message.includes("customer_name_required")) {
      return { ok: false, error: "errors.required", field: "customer_name" };
    }
    return { ok: false, error: "errors.generic" };
  }

  revalidatePath(`/${locale}/commandes`);
  redirectTo(`/commandes/${orderId}`, locale);
}
