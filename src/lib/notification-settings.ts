import { z } from "zod";
import type { Json } from "@/lib/supabase/database.types";

/**
 * Réglages des notifications — module PUR, importé des deux côtés : par le
 * serveur au moment d'envoyer, par l'écran Paramètres pour l'aperçu.
 *
 * Les deux colonnes jsonb de `settings` sont relues ici avec une valeur par
 * défaut : une valeur abîmée ne bloque jamais un envoi, elle retombe sur le
 * comportement d'origine.
 */

/** Les événements réglables, dans l'ordre de l'écran. */
export const RULE_KINDS = [
  "order_created",
  "order_updated",
  "order_cancelled",
  "order_restored",
  "daily_summary",
] as const;
export type RuleKind = (typeof RULE_KINDS)[number];

export type Rule = { bell: boolean; push: boolean };
export type NotificationRules = Record<RuleKind, Rule>;

export const DEFAULT_RULES: NotificationRules = Object.fromEntries(
  RULE_KINDS.map((kind) => [kind, { bell: true, push: true }]),
) as NotificationRules;

const ruleSchema = z.object({ bell: z.boolean(), push: z.boolean() });

export const notificationRulesSchema = z.object(
  Object.fromEntries(RULE_KINDS.map((kind) => [kind, ruleSchema])) as Record<
    RuleKind,
    typeof ruleSchema
  >,
);

/** Les règles enregistrées, complétées par les valeurs par défaut. */
export function parseRules(json: Json | undefined): NotificationRules {
  const rules = { ...DEFAULT_RULES };
  if (!json || typeof json !== "object" || Array.isArray(json)) return rules;
  for (const kind of RULE_KINDS) {
    const parsed = ruleSchema.safeParse(json[kind]);
    if (parsed.success) rules[kind] = parsed.data;
  }
  return rules;
}

// --- Textes des e-mails ------------------------------------------------------

export const EMAIL_KINDS = ["new_order", "daily"] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number];
export const EMAIL_LOCALES = ["fr", "ar"] as const;
export type EmailLocale = (typeof EMAIL_LOCALES)[number];

/** Les champs que chaque texte peut contenir — affichés en pastilles sous le champ. */
export const EMAIL_FIELDS: Record<EmailKind, readonly string[]> = {
  new_order: ["numero", "nom", "date", "auteur"],
  daily: ["date", "nombre"],
};

export const SUBJECT_MAX = 150;
export const INTRO_MAX = 500;

const textSchema = z.object({
  subject: z.string().trim().max(SUBJECT_MAX, "errors.tooLong"),
  intro: z.string().trim().max(INTRO_MAX, "errors.tooLong"),
});
export type EmailText = z.infer<typeof textSchema>;
export type EmailTexts = Record<EmailKind, Record<EmailLocale, EmailText>>;

/** Les textes d'UN e-mail, dans les deux langues — ce qu'enregistre un formulaire. */
export const emailTextsInputSchema = z.object({
  kind: z.enum(EMAIL_KINDS),
  fr: textSchema,
  ar: textSchema,
});

const EMPTY: EmailText = { subject: "", intro: "" };

export function parseEmailTexts(json: Json | undefined): EmailTexts {
  const texts = Object.fromEntries(
    EMAIL_KINDS.map((kind) => [kind, { fr: { ...EMPTY }, ar: { ...EMPTY } }]),
  ) as EmailTexts;
  if (!json || typeof json !== "object" || Array.isArray(json)) return texts;
  for (const kind of EMAIL_KINDS) {
    const byLocale = json[kind];
    if (!byLocale || typeof byLocale !== "object" || Array.isArray(byLocale)) continue;
    for (const locale of EMAIL_LOCALES) {
      const parsed = textSchema.safeParse(byLocale[locale]);
      if (parsed.success) texts[kind][locale] = parsed.data;
    }
  }
  return texts;
}

/**
 * Remplace `{nom}`, `{numero}`… Un champ inconnu reste tel quel : une faute
 * de frappe se voit dans l'aperçu au lieu de disparaître.
 */
export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (all, key: string) =>
    key in values ? values[key] : all,
  );
}
