import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sendTomorrowDigest } from "@/lib/email/notify";
import { notifyDailySummary, pruneNotifications } from "@/lib/notifications/service";
import { addDays, todayIso } from "@/lib/rental-range";

/**
 * Tâche planifiée du soir (vercel.json, 21 h UTC = 22 h à Alger) : l'e-mail
 * « Demain » — les mariages du lendemain — aux membres qui l'ont demandé,
 * le résumé du soir dans la cloche (et en push), puis le ménage des vieilles
 * notifications. Chaque tâche échoue seule : un e-mail parti n'est pas
 * « raté » parce que le push a échoué.
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
  const today = todayIso();
  const day = addDays(today, 1);
  const [sent, notified, pruned] = await Promise.allSettled([
    sendTomorrowDigest(day),
    notifyDailySummary(today, day),
    pruneNotifications(),
  ]);
  for (const [name, result] of [
    ["e-mail", sent],
    ["résumé", notified],
    ["ménage", pruned],
  ] as const) {
    if (result.status === "rejected") console.error(`[cron demain] ${name}`, result.reason);
  }

  const body = {
    day,
    sent: sent.status === "fulfilled" ? sent.value : null,
    notifications: notified.status === "fulfilled" ? notified.value : null,
  };
  const failed = sent.status === "rejected" && notified.status === "rejected";
  return NextResponse.json(failed ? { ...body, error: "failed" } : body, {
    status: failed ? 500 : 200,
  });
}
