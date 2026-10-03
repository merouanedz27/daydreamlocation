/**
 * Message au client — module PUR, importé des deux côtés.
 *
 * Le propriétaire écrit UN texte type dans « Boutique » ; chaque bouton 💬
 * le remplit avec la commande de sa ligne, puis ouvre l'application Messages sur le numéro
 * du client, message déjà tapé. L'employé n'a plus qu'à appuyer sur Envoyer.
 */
import { formatDate, formatMoney } from "@/lib/format";
import { normalizePhone } from "@/lib/phone";
import type { Locale } from "@/i18n/routing";

/** Les champs que le texte peut contenir — affichés en aide sous le champ. */
export const MESSAGE_FIELDS = ["nom", "numero", "date", "retrait", "retour", "reste"] as const;

export type MessageOrder = {
  order_no: string;
  customer_name: string;
  event_date: string;
  pickup_date: string;
  return_due_date: string;
  balance: number | null;
};

/**
 * Remplace `{nom}`, `{date}`… par les valeurs de la commande. Un champ
 * inconnu est laissé tel quel : une faute de frappe se voit dans Messages
 * avant l'envoi, au lieu de disparaître en silence.
 */
export function fillMessage(template: string, order: MessageOrder, locale: Locale): string {
  const values: Record<(typeof MESSAGE_FIELDS)[number], string> = {
    nom: order.customer_name,
    numero: order.order_no,
    date: formatDate(order.event_date, locale),
    retrait: formatDate(order.pickup_date, locale),
    retour: formatDate(order.return_due_date, locale),
    reste: formatMoney(order.balance ?? 0, locale),
  };
  return template.replace(/\{(\w+)\}/g, (all, key: string) =>
    key in values ? values[key as keyof typeof values] : all,
  );
}

/**
 * Lien SMS : ouvre l'application Messages du téléphone, numéro et texte déjà
 * remplis. Numéro mis au format international (« 0551 23 45 67 » →
 * « +213551234567 ») pour qu'il passe aussi depuis une puce étrangère.
 *
 * `?&body=` et non `?body=` : Android lit le premier, iOS le second — cette
 * forme est comprise par les deux.
 */
export function smsHref(phone: string, text: string): string {
  const normalized = normalizePhone(phone).replace(/^\+|^00/, "");
  const international = normalized.startsWith("0") ? `213${normalized.slice(1)}` : normalized;
  return text
    ? `sms:+${international}?&body=${encodeURIComponent(text)}`
    : `sms:+${international}`;
}
