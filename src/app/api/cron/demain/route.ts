import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sendTomorrowDigest } from "@/lib/email/notify";
import { addDays, todayIso } from "@/lib/rental-range";

/**
 * Tâche planifiée du soir (vercel.json, 18 h UTC = 19 h à Alger) : l'e-mail
 * « Demain » — les mariages du lendemain — aux membres qui l'ont demandé.
 *
 * Vercel appelle cette adresse avec `Authorization: Bearer <CRON_SECRET>`.
 * Sans ce secret, elle ne fait RIEN : elle lit les commandes par la clé
 * secrète, elle ne doit pas être déclenchable par n'importe qui.
 */
export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // « Demain » à l'heure d'Alger, comme l'écran du même nom.
  const day = addDays(todayIso(), 1);
  try {
    const sent = await sendTomorrowDigest(day);
    return NextResponse.json({ day, sent });
  } catch (error) {
    console.error("[cron demain]", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
