import { z } from "zod";
import { isAlgerianMobile, normalizePhone } from "@/lib/phone";

/** Messages = CLÉS i18n, jamais des phrases. Voir `daydream-i18n`. */

/**
 * Texte facultatif venant d'un FORMULAIRE.
 *
 * `.nullish()`, surtout pas `.optional()` seul : un champ ABSENT du formulaire
 * donne `formData.get(...) === null`, et non `undefined`. Zod rejetait donc le
 * schéma entier sur un champ que l'employé ne voit même pas — c'est ce qui
 * empêchait toute création de modèle, `description` n'existant pas dans le
 * formulaire. L'échec était de surcroît muet : le champ nommé dans l'erreur
 * n'ayant pas de place à l'écran, rien ne s'affichait.
 */
const optionalText = z
  .string()
  .trim()
  .max(200)
  .nullish()
  .transform((v) => (v ? v : null));

const money = z.coerce
  .number({ message: "errors.numberInvalid" })
  .min(0, { message: "errors.numberNegative" })
  .max(99_999_999);

/**
 * Montant OBLIGATOIRE : versement et caution.
 *
 * Décision du client : ces deux champs doivent être SAISIS, même à 0. Un champ
 * vide ne vaut donc plus 0 — c'est ce qui distingue « le client n'a rien
 * versé » de « l'employé a oublié de demander ». Le formulaire les présente
 * vides, pas pré-remplis à 0, sinon l'obligation ne voudrait rien dire.
 *
 * `z.unknown()` d'abord : `formData.get` rend `null` pour un champ absent, et
 * ce `null` doit produire « obligatoire », pas « saisissez un nombre ».
 */
const requiredMoney = z
  .unknown()
  .transform((v) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v)))
  .pipe(z.string().min(1, { message: "errors.required" }))
  // `Number("abc")` vaut NaN, que `z.number` refuse : « saisissez un nombre ».
  .transform(Number)
  .pipe(
    z
      .number({ message: "errors.numberInvalid" })
      .min(0, { message: "errors.numberNegative" })
      .max(99_999_999),
  );

/**
 * Téléphone du client : obligatoire, mobile algérien, enregistré NORMALISÉ.
 * Voir `src/lib/phone.ts`.
 *
 * Obligatoire dans l'APPLICATION seulement — pas de `not null` en base : les
 * commandes déjà saisies sans numéro, et l'import du Google Sheet, doivent
 * rester valides.
 */
const requiredPhone = z
  .unknown()
  .transform((v) => (typeof v === "string" ? normalizePhone(v) : ""))
  .pipe(
    z
      .string()
      .min(1, { message: "errors.required" })
      .refine(isAlgerianMobile, { message: "errors.phoneInvalid" }),
  );

// `min(1)` avant le motif : une date VIDE est un oubli (« obligatoire »), pas
// une date mal formée.
const isoDate = z
  .string({ message: "errors.required" })
  .min(1, { message: "errors.required" })
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "errors.dateInvalid" });

/**
 * Une ligne de commande : SOIT une pièce du stock, SOIT une pièce sous-louée
 * chez un confrère (la colonne « FETHI LOC » du tableur). Jamais les deux.
 *
 * La base est plus LARGE : `order_lines_designates_something` accepte aussi une
 * ligne qui nomme seulement un vêtement, sans stock ni confrère — ce que la
 * reprise du tableur écrit, et que la saisie ne propose pas. La règle stricte
 * des deux cas vit donc ici et dans `create_order`, qui rendent un message
 * lisible plutôt qu'une violation de contrainte.
 */
const unitLine = z.object({
  kind: z.literal("unit"),
  unitId: z.number().int().positive(),
  unitPrice: money,
  note: optionalText,
});

const externalLine = z.object({
  kind: z.literal("external"),
  source: optionalText,
  label: z.string().trim().min(1, { message: "errors.externalLabelRequired" }).max(200),
  cost: money.optional().nullable(),
  unitPrice: money,
  note: optionalText,
});

export const draftLineSchema = z.discriminatedUnion("kind", [unitLine, externalLine]);
export type DraftLineInput = z.infer<typeof draftLineSchema>;

export const orderSchema = z
  .object({
    customer_name: z
      .string()
      .trim()
      .min(1, { message: "errors.required" })
      .max(120),
    customer_phone: requiredPhone,
    event_date: isoDate,
    pickup_date: isoDate,
    return_due_date: isoDate,
    discount: money,
    amount_paid: requiredMoney,
    caution_amount: requiredMoney,
    notes: z.string().trim().max(1000).optional().transform((v) => (v ? v : null)),
    lines: z
      .array(draftLineSchema)
      .min(1, { message: "errors.linesRequired" })
      .max(50),
  })
  // Le schéma porte `orders_dates_coherent` ; on le vérifie ici aussi pour
  // pointer le champ fautif au lieu d'afficher une erreur Postgres.
  .refine((o) => o.return_due_date >= o.pickup_date, {
    message: "errors.datesIncoherent",
    path: ["return_due_date"],
  })
  // Deux fois la même pièce dans une commande : la contrainte d'exclusion la
  // refuserait (elle se chevauche elle-même), mais autant le dire clairement.
  .refine(
    (o) => {
      const ids = o.lines
        .filter((l): l is z.infer<typeof unitLine> => l.kind === "unit")
        .map((l) => l.unitId);
      return new Set(ids).size === ids.length;
    },
    { message: "errors.duplicateLine", path: ["lines"] },
  );

export type OrderInput = z.infer<typeof orderSchema>;

/**
 * TOUTES les erreurs d'un envoi, une par champ — et non la première seule.
 *
 * Le formulaire de commande tient sur une page qui défile : s'il ne signalait
 * qu'un champ à la fois, l'employé corrigerait, renverrait, découvrirait le
 * suivant plus bas, et recommencerait. Sur un téléphone, c'est ce va-et-vient
 * que le client reprochait à l'assistant.
 *
 * La clé est le champ de PREMIER niveau : une erreur dans
 * `lines[2].label` s'affiche sur la section des pièces, pas sur une ligne
 * qu'aucun champ ne représente. Le premier message rencontré par champ gagne.
 *
 * Partagé par le navigateur et la Server Action : les deux côtés parlent
 * exactement la même langue d'erreurs.
 */
export function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !(key in errors)) errors[key] = issue.message;
  }
  return errors;
}

/**
 * Un mouvement d'argent sur une commande déjà créée.
 *
 * `direction` plutôt qu'un montant signé : un « - » devant un chiffre se voit
 * mal, se tape par erreur, et se lit encore plus mal sur un écran de 390 px.
 * Le signe vient donc d'un choix explicite à l'écran, et le montant reste
 * toujours positif — y compris pour une correction.
 */
export const paymentSchema = z.object({
  amount: z.coerce
    .number({ message: "errors.numberInvalid" })
    .gt(0, { message: "errors.paymentZero" })
    .max(99_999_999, { message: "errors.numberInvalid" }),
  // `formData.get` rend `null` quand le champ est absent : on ne peut pas se
  // reposer sur un `.default()`, qui ne s'applique qu'à `undefined`.
  direction: z
    .unknown()
    .transform((v) => (v === "refund" ? ("refund" as const) : ("payment" as const))),
});

export type PaymentInput = z.infer<typeof paymentSchema>;
