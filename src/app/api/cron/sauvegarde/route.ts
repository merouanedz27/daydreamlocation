import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { sendMonthlyBackup } from "@/lib/email/notify";

/**
 * Tâche planifiée du 1er du mois (vercel.json, 2 h UTC = 3 h à Alger) : la
 * sauvegarde Excel de tout l'historique, envoyée aux administrateurs.
 *
 * Un échec rend 500 : Vercel marque la tâche en erreur, au lieu d'un mois
 * sans sauvegarde passé sous silence.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await sendMonthlyBackup());
  } catch (error) {
    console.error("[cron sauvegarde]", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
