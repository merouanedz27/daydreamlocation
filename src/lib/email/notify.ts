import "server-only";
import { getTranslations } from "next-intl/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { appUrl, emailConfigured, sendMails, type Mail } from "@/lib/email/send";
import { formatDate, formatLongDay, formatMoney } from "@/lib/format";
import { getLabelSlots } from "@/lib/queries/orders";
import type { EditableOrder } from "@/lib/quick-draft";
import { normalizeSearch } from "@/lib/search";
import { ticketFields } from "@/lib/ticket-fields";
import type { Locale } from "@/i18n/routing";

/*
 * Les trois e-mails, aux SEULS administrateurs. Les destinataires se lisent avec le client
 * ADMIN : le résumé du soir part d'une tâche planifiée, sans session, et un
 * membre `staff` qui saisit une commande ne voit pas les profils des autres
 * (`profiles_read`). Seuls nom, adresse, langue et préférences sont lus.
 *
 * Seul l'e-mail « Nouvelle commande » porte de l'argent (VERS / PRIX / REST),
 * comme celui de son AppSheet ; le résumé du soir n'en porte pas.
 */

export type Recipient = {
  id: string;
  full_name: string;
  email: string;
  email_locale: Locale;
};

type Flag = "notify_new_order" | "notify_daily";

/**
 * Les ADMINISTRATEURS actifs qui ont une adresse — et, le cas échéant, la case
 * cochée. Un membre `staff` ne reçoit JAMAIS d'e-mail, quelle que soit sa
 * case : c'est le choix du propriétaire (et le coût de l'envoi reste bas).
 */
export async function getRecipients(flag?: Flag): Promise<Recipient[]> {
  const admin = createAdminClient();
  let request = admin
    .from("profiles")
    .select("id, full_name, email, email_locale")
    .eq("is_active", true)
    .eq("role", "owner")
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
  parts: {
    title: string;
    intro?: string;
    lines?: Line[];
    /** Le tableau « Libellé : valeur » de son e-mail AppSheet — lignes vides comprises. */
    table?: Line[];
    body?: string;
    links?: [label: string, href: string][];
    footer: string;
  },
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
${
  parts.table
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:16px;line-height:1.35">${parts.table
        .map(
          ([label, value]) =>
            `<tr><td style="padding:5px 0;padding-inline-end:18px;vertical-align:top;white-space:nowrap">${escapeHtml(label)}</td><td style="padding:5px 0;vertical-align:top">${escapeHtml(value ?? "")}</td></tr>`,
        )
        .join("")}</table>`
    : ""
}
${parts.body ? `<div style="font-size:15px;line-height:1.5">${parts.body}</div>` : ""}
${
  parts.links?.length
    ? `<p style="margin:18px 0 0">${parts.links
        .map(
          ([label, href], i) =>
            `<a href="${escapeHtml(href)}" style="display:inline-block;margin:0 0 8px;margin-inline-end:8px;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:15px;${
              i === 0
                ? "background:#1c1917;color:#ffffff"
                : "border:1px solid #1c1917;color:#1c1917"
            }">${escapeHtml(label)}</a>`,
        )
        .join("")}</p>`
    : ""
}
</div>
<p style="margin:12px 0 0;font-size:12px;color:#78716c;text-align:center">${escapeHtml(parts.footer)}</p>
</div></body></html>`;

  const text = [
    parts.title,
    parts.intro,
    ...lines.map(([l, v]) => `${l} ${v}`),
    ...(parts.table ?? []).map(([l, v]) => `${l} ${v ?? ""}`),
    parts.body
      ?.replace(/<br>|<\/li>/g, "\n")
      .replace(/<[^>]+>/g, "")
      .trim(),
    ...(parts.links ?? []).map(([l, href]) => `${l} : ${href}`),
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
        links: [[t("openApp"), `${appUrl()}/${r.email_locale}/commandes`]],
        footer: t("footer"),
      });
      return { to: r.email, subject: message.subject, html, text };
    }),
  );
  return sendMails(mails);
}

/* --- 2. Nouvelle commande ----------------------------------------------- */

/**
 * L'e-mail de chaque commande saisie — le MÊME que celui que son AppSheet lui
 * envoyait : un tableau « Clients / Numéro Tél / Date / Allez Validé / … /
 * VERS / PRIX / REST », dans cet ordre, avec ses émojis. Les champs sont
 * calculés comme ceux du bon de location (`ticket-fields.ts`).
 *
 * À TOUS ceux qui ont coché « Nouvelle commande », y compris celui qui l'a
 * saisie : son AppSheet lui envoyait aussi ses propres commandes — c'est sa
 * trace. Qui n'en veut pas décoche la case.
 *
 * Appelé APRÈS la réponse (`after()` dans l'action) : la saisie n'attend pas
 * l'envoi. Une erreur ici ne remonte nulle part : la commande est enregistrée.
 */
export async function notifyNewOrder(orderId: number): Promise<void> {
  if (!emailConfigured()) return;
  try {
    const recipients = await getRecipients("notify_new_order");
    if (recipients.length === 0) return;

    const admin = createAdminClient();
    const [{ data }, labelSlots] = await Promise.all([
      admin
        .from("orders")
        .select(
          `*, profiles ( full_name ),
           order_lines ( *, article_units ( ref_code, article_models ( categories ( slug ) ) ) )`,
        )
        .eq("id", orderId)
        .order("id", { referencedTable: "order_lines", ascending: true })
        .single(),
      getLabelSlots(admin),
    ]);
    if (!data) return;

    type OrderLine = EditableOrder["order_lines"][number] & {
      is_active: boolean;
      article_units: {
        ref_code: string;
        article_models: { categories: { slug: string } | null } | null;
      } | null;
    };
    const order = data as unknown as Omit<EditableOrder, "order_lines"> & {
      id: number;
      order_no: string;
      balance: number | null;
      profiles: { full_name: string } | null;
      order_lines: OrderLine[];
    };
    const lines = order.order_lines.filter((l) => l.is_active);
    const categoryByUnit = new Map<number, string | null>();
    for (const l of lines) {
      if (l.unit_id) {
        categoryByUnit.set(l.unit_id, l.article_units?.article_models?.categories?.slug ?? null);
      }
    }
    const fields = ticketFields(
      { ...order, order_lines: lines },
      {
        slotOf: (label) => labelSlots.get(normalizeSearch(label)) ?? null,
        categoryOfUnit: (unitId) => categoryByUnit.get(unitId) ?? null,
      },
    );

    const mails = await Promise.all(
      recipients.map(async (r) => {
        const loc = r.email_locale;
        const t = await getTranslations({ locale: loc, namespace: "email" });
        const yesNo = (v: boolean) => t(v ? "order.yes" : "order.no");
        const balance = order.balance ?? 0;
        const subject = t("newOrder.subject", {
          orderNo: order.order_no,
          customer: order.customer_name,
        });
        const { html, text } = layout(loc, {
          title: t("newOrder.title", { orderNo: order.order_no }),
          intro: order.profiles ? t("newOrder.by", { name: order.profiles.full_name }) : undefined,
          table: [
            [t("order.customer"), order.customer_name],
            [t("order.phone"), order.customer_phone],
            [t("order.date"), formatDate(order.event_date, loc)],
            [t("order.pickedUp"), yesNo(order.picked_up)],
            [t("order.returned"), yesNo(order.returned)],
            [t("order.costume"), fields.costume],
            [t("order.jacketSize"), fields.jacketSize],
            [t("order.vestSize"), fields.vestSize],
            [t("order.pantsSize"), fields.pantsSize],
            [t("order.tailor"), fields.tailor],
            [t("order.shirt"), fields.shirt],
            [t("order.shoes"), fields.shoes],
            [t("order.accessories"), fields.accessories],
            [t("order.paid"), formatMoney(order.amount_paid, loc)],
            [t("order.price"), formatMoney(order.total_price, loc)],
            [t(balance < 0 ? "order.refund" : "order.rest"), formatMoney(Math.abs(balance), loc)],
          ],
          links: [
            [t("openOrder"), `${appUrl()}/${loc}/commandes/${order.id}`],
            [t("openSlip"), `${appUrl()}/${loc}/imprimer/commande/${order.id}`],
          ],
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
        links: [[t("openTomorrow"), `${appUrl()}/${r.email_locale}/commandes/demain`]],
        footer: t("footer"),
      });
      return { to: r.email, subject, html, text };
    }),
  );
  return sendMails(mails);
}
