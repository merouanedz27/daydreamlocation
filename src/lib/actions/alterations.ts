"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfile, isTailor } from "@/lib/auth";
import { notifyAlterationDone } from "@/lib/email/notify";
import { notifyAlterationsDone } from "@/lib/notifications/service";
import { routing, type Locale } from "@/i18n/routing";

function resolveLocale(value: unknown): Locale {
  return routing.locales.includes(value as Locale) ? (value as Locale) : routing.defaultLocale;
}

const idSchema = z.string().uuid();
const idsSchema = z.array(idSchema).min(1).max(200);

function revalidate(locale: Locale, orderId?: number) {
  revalidatePath(`/${locale}/atelier`, "layout");
  revalidatePath(`/${locale}/retouches`);
  if (orderId) revalidatePath(`/${locale}/commandes/${orderId}`);
}

export type MarkAlteredResult =
  | {
      ok: true;
      alreadyDone: boolean;
      customerName: string;
      piece: string | null;
    }
  | { ok: false; error: string };

/**
 * Le tailleur (ou l'équipe) scanne une étiquette : la pièce est taillée.
 *
 * Par la SEULE fonction `mark_altered` — le tailleur n'a aucune policy sur les
 * tables. Elle est idempotente : un second scan rend `already_done` et
 * n'envoie pas de second e-mail.
 */
export async function markAltered(input: { id: string; locale: string }): Promise<MarkAlteredResult> {
  const locale = resolveLocale(input.locale);
  const profile = await getProfile();
  if (!profile) return { ok: false, error: "errors.forbidden" };

  const parsed = idSchema.safeParse(input.id);
  if (!parsed.success) return { ok: false, error: "alterations.errors.unknownLabel" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_altered", { p_id: parsed.data });
  if (error) {
    if (error.code === "P0002") return { ok: false, error: "alterations.errors.unknownLabel" };
    if (error.message.includes("order_cancelled")) {
      return { ok: false, error: "alterations.errors.orderCancelled" };
    }
    return { ok: false, error: "errors.generic" };
  }
  const row = data?.[0];
  if (!row) return { ok: false, error: "alterations.errors.unknownLabel" };

  revalidate(locale, row.order_id);

  if (!row.already_done) {
    // Après la réponse : le tailleur voit « Taillée ✓ » sans attendre le
    // serveur de messagerie, et un échec d'envoi ne défait pas le scan.
    after(() =>
      notifyAlterationDone({
        orderId: row.order_id,
        orderNo: row.order_no,
        customerName: row.customer_name,
        eventDate: row.event_date,
        note: row.note,
        piece: [row.model_name, row.ref_code].filter(Boolean).join(" · ") || null,
        size: row.size,
        doneAt: row.done_at ?? new Date().toISOString(),
        doneBy: profile.full_name,
      }),
    );
    // Dernier pantalon de la commande : cloche + push à toute l'équipe.
    after(() => notifyAlterationsDone(row.order_id, profile.id));
  }

  return {
    ok: true,
    alreadyDone: row.already_done,
    customerName: row.customer_name,
    piece: row.model_name,
  };
}

export type AlterationResult = { ok: true } | { ok: false; error: string };

/**
 * Un scan par erreur : la pièce repart « à faire ».
 *
 * Par la fonction `undo_altered` — le tailleur n'a aucune policy sur les
 * tables. Il ne défait que SES propres scans ; l'équipe du magasin, tous.
 */
export async function undoAltered(input: { id: string; locale: string }): Promise<AlterationResult> {
  const locale = resolveLocale(input.locale);
  const profile = await getProfile();
  if (!profile) return { ok: false, error: "errors.forbidden" };

  const parsed = idSchema.safeParse(input.id);
  if (!parsed.success) return { ok: false, error: "errors.generic" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("undo_altered", { p_id: parsed.data });
  if (error) {
    if (error.code === "42501") return { ok: false, error: "errors.forbidden" };
    if (error.code === "P0002") return { ok: false, error: "alterations.errors.unknownLabel" };
    return { ok: false, error: "errors.generic" };
  }

  revalidate(locale, data ?? undefined);
  return { ok: true };
}

/**
 * Les étiquettes viennent d'être imprimées : « Imprimer les nouvelles » ne
 * les reprendra plus. Une réimpression à l'unité reste possible.
 */
export async function markLabelsPrinted(input: {
  ids: string[];
  locale: string;
}): Promise<AlterationResult> {
  const locale = resolveLocale(input.locale);
  const profile = await getProfile();
  if (!profile || isTailor(profile)) return { ok: false, error: "errors.forbidden" };

  const parsed = idsSchema.safeParse(input.ids);
  if (!parsed.success) return { ok: false, error: "errors.generic" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("line_alterations")
    .update({ printed_at: new Date().toISOString() })
    .in("id", parsed.data)
    .is("printed_at", null);
  if (error) return { ok: false, error: "errors.generic" };

  revalidate(locale);
  revalidatePath(`/${locale}/commandes`, "layout");
  return { ok: true };
}
