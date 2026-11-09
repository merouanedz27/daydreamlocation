import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * Les tâches planifiées (vercel.json) : Vercel les appelle avec
 * `Authorization: Bearer <CRON_SECRET>`. Sans ce secret, une tâche ne fait
 * RIEN — elles lisent la base par la clé secrète et ne doivent pas être
 * déclenchables par n'importe qui.
 */
export function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
