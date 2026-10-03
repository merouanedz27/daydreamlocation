import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

/**
 * Envoi d'e-mails par SMTP — un seul chemin de code pour tous les
 * fournisseurs GRATUITS :
 *
 * - Gmail + mot de passe d'application (recommandé, aucun domaine requis) :
 *   SMTP_HOST=smtp.gmail.com, SMTP_PORT=465, SMTP_USER=adresse Gmail,
 *   SMTP_PASS=mot de passe d'application (16 lettres) ;
 * - Resend, une fois un domaine vérifié : SMTP_HOST=smtp.resend.com,
 *   SMTP_USER=resend, SMTP_PASS=la clé API.
 *
 * Variables absentes = aucun envoi, et RIEN ne casse : une commande se saisit
 * toujours. Lues dans la fonction, jamais au niveau du module, comme
 * `createAdminClient`.
 */
let cached: Transporter | null = null;

export function emailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function transport(): Transporter {
  if (cached) return cached;
  const port = Number(process.env.SMTP_PORT ?? 465);
  cached = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // 465 = TLS d'emblée ; 587 = STARTTLS.
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return cached;
}

export type Mail = { to: string; subject: string; html: string; text: string };

/**
 * Un e-mail PAR destinataire : personne ne voit l'adresse des autres.
 * Rend le nombre d'envois réussis ; un échec n'arrête pas les suivants.
 */
export async function sendMails(mails: Mail[]): Promise<number> {
  if (!emailConfigured() || mails.length === 0) return 0;
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  const results = await Promise.allSettled(
    mails.map((mail) => transport().sendMail({ from, ...mail })),
  );
  for (const r of results) {
    if (r.status === "rejected") console.error("[email]", r.reason);
  }
  return results.filter((r) => r.status === "fulfilled").length;
}

/** L'adresse publique de l'application, pour les liens des e-mails. */
export function appUrl(): string {
  const url =
    process.env.APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000");
  return url.replace(/\/$/, "");
}
