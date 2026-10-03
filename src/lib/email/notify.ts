import "server-only";
import { getTranslations } from "next-intl/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { appUrl, emailConfigured, sendMails, type Mail } from "@/lib/email/send";
import { formatDate, formatLongDay } from "@/lib/format";
import type { Locale } from "@/i18n/routing";

/*
 * Les trois e-mails de l'équipe. Les destinataires se lisent avec le client
 * ADMIN : le résumé du soir part d'une tâche planifiée, sans session, et un
 * membre `staff` qui saisit une commande ne voit pas les profils des autres
 * (`profiles_read`). Seuls nom, adresse, langue et préférences sont lus.
 *
 * Un e-mail ne porte JAMAIS d'argent : il peut être lu par-dessus l'épaule.
 */

export type Recipient = {
  id: string;
  full_name: string;
  email: string;
  email_locale: Locale;
};

type Flag = "notify_new_order" | "notify_daily";

/** Les membres ACTIFS qui ont une adresse — et, le cas échéant, la case cochée. */
export async function getRecipients(flag?: Flag): Promise<Recipient[]> {
  const admin = createAdminClient();
  let request = admin
    .from("profiles")
    .select("id, full_name, email, email_locale")
    .eq("is_active", true)
    .not("email", "is", null);
  if (flag) request = request.eq(flag, true);
  const { data, error } = await request.order("full_name");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    ...r,
    email: r.email!,
    email_locale: r.email_locale === "ar" ? "ar" : "fr",
  }));
}

/* --- Mise en page ------------------------------------------------------- */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Une ligne « Libellé : valeur » — valeur échappée, libellé de nos traductions. */
type Line = [label: string, value: string | null | undefined];

/**
 * Un e-mail simple, lisible sur téléphone : styles EN LIGNE (les messageries
 * ignorent les feuilles de style), arabe de droite à gauche.
 */
function layout(
  locale: Locale,
  parts: { title: string; intro?: string; lines?: Line[]; body?: string; link?: [string, string]; footer: string },
): { html: string; text: string } {
  const dir = locale === "ar" ? "rtl" : "ltr";
  const align = locale === "ar" ? "right" : "left";
  const lines = (parts.lines ?? []).filter(([, v]) => v);

  const html = `<!doctype html><html lang="${locale}" dir="${dir}"><body style="margin:0;background:#f5f2ec;font-family:Arial,Helvetica,sans-serif;color:#1c1917">
<div style="max-width:520px;margin:0 auto;padding:24px 16px" dir="${dir}">
<div style="background:#ffffff;border-radius:8px;padding:20px;text-align:${align}">
<p style="margin:0 0 4px;font-size:12px;letter-spacing:2px;color:#a16207">DAYDREAM</p>
<h1 style="margin:0 0 12px;font-size:20px">${escapeHtml(parts.title)}</h1>
${parts.intro ? `<p style="margin:0 0 12px;font-size:15px">${escapeHtml(parts.intro)}</p>` : ""}
${lines
  .map(
    ([label, value]) =>
      `<p style="margin:0 0 6px;font-size:15px"><b>${escapeHtml(label)}</b> ${escapeHtml(value!)}</p>`,
  )
  .join("\n")}
${parts.body ? `<div style="font-size:15px;line-height:1.5">${parts.body}</div>` : ""}
${
  parts.link
    ? `<p style="margin:18px 0 0"><a href="${escapeHtml(parts.link[1])}" style="display:inline-block;background:#1c1917;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:15px">${escapeHtml(parts.link[0])}</a></p>`
    : ""
}
</div>
<p style="margin:12px 0 0;font-size:12px;color:#78716c;text-align:center">${escapeHtml(parts.footer)}</p>
</div></body></html>`;

  const text = [
    parts.title,
    parts.intro,
    ...lines.map(([l, v]) => `${l} ${v}`),
    parts.body?.replace(/<br>|<\/li>/g, "\n").replace(/<[^>]+>/g, "").trim(),
    parts.link ? `${parts.link[0]} : ${parts.link[1]}` : undefined,
    "",
    parts.footer,
  ]
    .filter((x) => x !== undefined)
    .join("\n");

  return { html, text };
}

/* --- 1. Message de l'administrateur ------------------------------------- */

/** Envoie le message tel qu'écrit ; rend le nombre d'e-mails partis. */
export async function sendTeamMessage(
  recipients: Recipient[],
  message: { subject: string; body: string; senderName: string },
): Promise<number> {
  const mails: Mail[] = await Promise.all(
    recipients.map(async (r) => {
      const t = await getTranslations({ locale: r.email_locale, namespace: "email" });
      const { html, text } = layout(r.email_locale, {
        title: message.subject,
        intro: t("messageFrom", { name: message.senderName }),
        body: escapeHtml(message.body).replace(/\n/g, "<br>"),
        link: [t("openApp"), `${appUrl()}/${r.email_locale}/commandes`],
        footer: t("footer"),
      });
      return { to: r.email, subject: message.subject, html, text };
    }),
  );
  return sendMails(mails);
}

/* --- 2. Nouvelle commande ----------------------------------------------- */

/**
 * Prévient l'équipe d'une commande saisie — sauf celui qui l'a saisie. Appelé
 * APRÈS la réponse (`after()` dans l'action) : la saisie n'attend pas l'envoi.
 * Une erreur ici ne remonte nulle part : la commande est déjà enregistrée.
 */
export async function notifyNewOrder(orderId: number, creatorId: string): Promise<void> {
  if (!emailConfigured()) return;
  try {
    const recipients = (await getRecipients("notify_new_order")).filter((r) => r.id !== creatorId);
    if (recipients.length === 0) return;

    const admin = createAdminClient();
    const { data: order } = await admin
      .from("orders")
      .select(
        `id, order_no, customer_name, customer_phone, event_date, profiles ( full_name ),
         order_lines ( id, is_active, model_name_snapshot, external_label, size_snapshot )`,
      )
      .eq("id", orderId)
      .single();
    if (!order) return;

    type Row = {
      id: number;
      order_no: string;
      customer_name: string;
      customer_phone: string | null;
      event_date: string;
      profiles: { full_name: string } | null;
      order_lines: {
        id: number;
        is_active: boolean;
        model_name_snapshot: string | null;
        external_label: string | null;
        size_snapshot: string | null;
      }[];
    };
    const o = order as unknown as Row;
    const items = o.order_lines
      .filter((l) => l.is_active)
      .sort((a, b) => a.id - b.id)
      .map((l) => {
        const name = l.external_label || l.model_name_snapshot || "";
        return l.size_snapshot ? `${name} (${l.size_snapshot})` : name;
      })
      .filter(Boolean)
      .join(" · ");

    const mails = await Promise.all(
      recipients.map(async (r) => {
        const t = await getTranslations({ locale: r.email_locale, namespace: "email" });
        const subject = t("newOrder.subject", { orderNo: o.order_no, customer: o.customer_name });
        const { html, text } = layout(r.email_locale, {
          title: t("newOrder.title", { orderNo: o.order_no }),
          intro: o.profiles ? t("newOrder.by", { name: o.profiles.full_name }) : undefined,
          lines: [
            [t("customer"), o.customer_name],
            [t("phone"), o.customer_phone],
            [t("eventDate"), formatDate(o.event_date, r.email_locale)],
            [t("items"), items],
          ],
          link: [t("openOrder"), `${appUrl()}/${r.email_locale}/commandes/${o.id}`],
          footer: t("footer"),
        });
        return { to: r.email, subject, html, text };
      }),
    );
    await sendMails(mails);
  } catch (error) {
    console.error("[email] nouvelle commande", error);
  }
}

/* --- 3. Les mariages de demain ------------------------------------------ */

/**
 * Le résumé du soir : les commandes dont l'ÉVÉNEMENT est `day`, comme l'écran
 * « Demain ». Rien à envoyer quand la journée est vide. Rend le nombre
 * d'e-mails partis.
 */
export async function sendTomorrowDigest(day: string): Promise<number> {
  if (!emailConfigured()) return 0;
  const recipients = await getRecipients("notify_daily");
  if (recipients.length === 0) return 0;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("orders")
    .select("id, order_no, customer_name, customer_phone, picked_up")
    .eq("event_date", day)
    .neq("status", "annulee")
    .order("customer_name");
  if (error) throw error;
  const orders = data ?? [];
  if (orders.length === 0) return 0;

  const mails = await Promise.all(
    recipients.map(async (r) => {
      const t = await getTranslations({ locale: r.email_locale, namespace: "email" });
      const date = formatLongDay(day, r.email_locale);
      const subject = t("daily.subject", { count: orders.length, date });
      const body = `<ul style="padding-inline-start:20px;margin:0">${orders
        .map(
          (o) =>
            `<li style="margin:0 0 6px"><b>${escapeHtml(o.customer_name)}</b> · ${escapeHtml(o.order_no)}${
              o.customer_phone ? ` · <span dir="ltr">${escapeHtml(o.customer_phone)}</span>` : ""
            }${o.picked_up ? ` · ${escapeHtml(t("daily.pickedUp"))}` : ""}</li>`,
        )
        .join("")}</ul>`;
      const { html, text } = layout(r.email_locale, {
        title: t("daily.title", { date }),
        intro: t("daily.intro", { count: orders.length }),
        body,
        link: [t("openTomorrow"), `${appUrl()}/${r.email_locale}/commandes/demain`],
        footer: t("footer"),
      });
      return { to: r.email, subject, html, text };
    }),
  );
  return sendMails(mails);
}
