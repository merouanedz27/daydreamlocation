"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile, isOwner } from "@/lib/auth";
import { fieldErrorsOf, orderSchema, paymentSchema } from "@/lib/validation/orders";
import type { z } from "zod";
import { getSettings, getUnavailableUnits, type Unavailability } from "@/lib/queries/orders";
import { redirectTo } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";

type OrderInput = z.infer<typeof orderSchema>;

export type ActionResult =
  | { ok: true; id?: number }
  | {
      ok: false;
      error: string;
      field?: string;
      values?: Record<string, string>;
      /** Toutes les erreurs par champ, quand le formulaire sait les afficher. */
      fieldErrors?: Record<string, string>;
    };

function resolveLocale(value: FormDataEntryValue | null): Locale {
  return routing.locales.includes(value as Locale)
    ? (value as Locale)
    : routing.defaultLocale;
}

/** Violation de la contrainte d'exclusion : une pièce est déjà réservée. */
const EXCLUSION_VIOLATION = "23P01";

/**
 * Traduit un conflit de réservation, ou rend `null` si l'erreur est autre.
 *
 * Les fonctions SQL retraduisent la violation d'exclusion en nommant la pièce
 * (« unit_unavailable:Gio-079-01 ») parce que « 23P01 » ne se corrige pas.
 * Le repli sans nom reste là pour un conflit qui remonterait directement de la
 * contrainte, sans passer par une de nos fonctions.
 */
function unitConflict(error: { code?: string; message: string }): ActionResult | null {
  const named = /unit_unavailable:(.+)$/.exec(error.message);
  if (named) {
    return {
      ok: false,
      error: "errors.unitUnavailableNamed",
      values: { ref: named[1].trim() },
    };
  }
  if (error.code === EXCLUSION_VIOLATION) {
    return { ok: false, error: "errors.unitUnavailable" };
  }
  return null;
}

/**
 * Disponibilité des pièces sur une fenêtre — pour GRISER, pas pour décider.
 *
 * Appelée quand l'employé change les dates. Le verdict final appartient à la
 * base : entre cet affichage et la validation, un collègue peut réserver la
 * même veste depuis un autre téléphone.
 */
export async function checkAvailability(
  pickup: string,
  returnDue: string,
  excludeOrderId?: number,
): Promise<Unavailability[]> {
  const profile = await getProfile();
  if (!profile) return [];

  const settings = await getSettings();
  return getUnavailableUnits(
    pickup,
    returnDue,
    settings.cleaning_buffer_days,
    Number.isInteger(excludeOrderId) ? excludeOrderId : undefined,
  );
}

/** Lit et valide le formulaire de commande (saisie ET modification). */
function parseOrderForm(
  formData: FormData,
):
  | { ok: true; input: OrderInput }
  | { ok: false; result: ActionResult } {
  let lines: unknown;
  try {
    lines = JSON.parse(String(formData.get("lines") ?? "[]"));
  } catch {
    return { ok: false, result: { ok: false, error: "errors.generic" } };
  }

  const parsed = orderSchema.safeParse({
    customer_name: formData.get("customer_name"),
    customer_phone: formData.get("customer_phone"),
    event_date: formData.get("event_date"),
    pickup_date: formData.get("pickup_date"),
    return_due_date: formData.get("return_due_date"),
    discount: formData.get("discount") || 0,
    // Vide = 0 : voir `optionalMoney`.
    amount_paid: formData.get("amount_paid"),
    caution_amount: formData.get("caution_amount"),
    notes: formData.get("notes"),
    lines,
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      result: {
        ok: false,
        error: issue.message,
        field: String(issue.path[0] ?? ""),
        fieldErrors: fieldErrorsOf(parsed.error),
      },
    };
  }
  return { ok: true, input: parsed.data };
}

/** Les lignes au format attendu par `create_order` / `update_order`. */
function toRpcLines(lines: OrderInput["lines"]) {
  return lines.map((l) => {
    switch (l.kind) {
      case "unit":
        return { unitId: l.unitId, unitPrice: l.unitPrice, note: l.note ?? "" };
      case "named":
        return {
          kind: "named",
          name: l.name,
          size: l.size ?? "",
          unitPrice: l.unitPrice,
          note: l.note ?? "",
        };
      case "external":
        return {
          source: l.source ?? "",
          label: l.label,
          cost: l.cost ?? "",
          unitPrice: l.unitPrice,
          note: l.note ?? "",
        };
    }
  });
}

/** Erreurs attendues de l'écriture d'une commande, traduites en clés i18n. */
function orderWriteError(error: { code?: string; message: string }): ActionResult {
  const conflict = unitConflict(error);
  if (conflict) return conflict;

  if (error.message.includes("lines_required")) {
    return { ok: false, error: "errors.linesRequired" };
  }
  if (error.message.includes("external_label_required")) {
    return { ok: false, error: "errors.externalLabelRequired" };
  }
  if (error.message.includes("named_label_required")) {
    return { ok: false, error: "errors.linesRequired" };
  }
  if (error.message.includes("customer_name_required")) {
    return { ok: false, error: "errors.required", field: "customer_name" };
  }
  if (error.message.includes("order_cancelled")) {
    return { ok: false, error: "errors.orderCancelledEdit" };
  }
  if (error.message.includes("order_not_found")) {
    return { ok: false, error: "errors.forbidden" };
  }
  return { ok: false, error: "errors.generic" };
}

/**
 * Crée une commande et toutes ses lignes.
 *
 * Passe par la fonction SQL `create_order` et non par deux appels successifs :
 * une commande dont la 3ᵉ pièce est déjà louée ne doit rien laisser derrière
 * elle. Voir `supabase/migrations/20260911120000_create_order_rpc.sql`.
 *
 * Le contrôle de rôle est refait ici : une Server Action est un point d'entrée
 * réseau à part entière. La RLS refuserait de toute façon, mais on veut un
 * message propre plutôt qu'une erreur Postgres brute.
 */
export async function createOrder(formData: FormData): Promise<ActionResult> {
  const locale = resolveLocale(formData.get("locale"));

  const profile = await getProfile();
  // Créer une commande est le métier quotidien de l'équipe : `staff` suffit.
  if (!profile) return { ok: false, error: "errors.forbidden" };

  const parsed = parseOrderForm(formData);
  if (!parsed.ok) return parsed.result;

  const input = parsed.input;
  const supabase = await createClient();

  const { data: orderId, error } = await supabase.rpc("create_order", {
    p_customer_name: input.customer_name,
    // Vide = pas de numéro : la fonction SQL le ramène à NULL.
    p_customer_phone: input.customer_phone ?? "",
    p_event_date: input.event_date,
    p_pickup_date: input.pickup_date,
    p_return_due_date: input.return_due_date,
    p_discount: input.discount,
    p_amount_paid: input.amount_paid,
    p_caution_amount: input.caution_amount,
    p_notes: input.notes ?? "",
    p_lines: toRpcLines(input.lines),
  });

  if (error) return orderWriteError(error);

  // « Allez validé » / « Retour validé » cochés DÈS la saisie — son AppSheet
  // les propose dans le formulaire : le client qui réserve et emporte sa tenue
  // dans la foulée. Écrits par une mise à jour ordinaire, pour que le trigger
  // `orders_before_update` en déduise le statut exactement comme pour une case
  // cochée sur la fiche. Un échec ici ne défait pas la commande, déjà
  // enregistrée : la case reste simplement à cocher sur la fiche.
  const pickedUp = formData.get("picked_up") === "1";
  const returned = formData.get("returned") === "1";
  if (pickedUp || returned) {
    await supabase
      .from("orders")
      .update({ picked_up: pickedUp || returned, returned })
      .eq("id", Number(orderId));
  }

  revalidatePath(`/${locale}/commandes`, "layout");

  // La saisie rapide navigue elle-même : elle doit d'abord vider son brouillon,
  // puis soit ouvrir la fiche, soit rester sur place pour la commande suivante.
  if (formData.get("return_id") === "1") return { ok: true, id: Number(orderId) };

  redirectTo(`/commandes/${orderId}`, locale);
}

/**
 * Modifie une commande — le MÊME formulaire que la saisie, rouvert sur elle.
 *
 * Passe par `update_order`, qui réécrit la commande et REMPLACE ses lignes en
 * une transaction : si une pièce du stock est déjà louée sur les nouvelles
 * dates, rien n'est modifié. Voir
 * `supabase/migrations/20261002140000_modifier_commande.sql`.
 *
 * Ouverte à `staff`, comme la saisie : corriger une faute de frappe est le
 * même métier que la faire.
 */
export async function updateOrder(formData: FormData): Promise<ActionResult> {
  const locale = resolveLocale(formData.get("locale"));

  const profile = await getProfile();
  if (!profile) return { ok: false, error: "errors.forbidden" };

  const orderId = Number(formData.get("id"));
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return { ok: false, error: "errors.generic" };
  }

  const parsed = parseOrderForm(formData);
  if (!parsed.ok) return parsed.result;
  const input = parsed.input;

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_order", {
    p_order_id: orderId,
    p_customer_name: input.customer_name,
    p_customer_phone: input.customer_phone ?? "",
    p_event_date: input.event_date,
    p_pickup_date: input.pickup_date,
    p_return_due_date: input.return_due_date,
    p_amount_paid: input.amount_paid,
    p_caution_amount: input.caution_amount,
    p_notes: input.notes ?? "",
    p_picked_up: formData.get("picked_up") === "1",
    p_returned: formData.get("returned") === "1",
    p_lines: toRpcLines(input.lines),
  });

  if (error) return orderWriteError(error);

  revalidatePath(`/${locale}/commandes`, "layout");
  return { ok: true, id: orderId };
}

/**
 * Coche ou décoche « Aller validé » / « Retour validé ».
 *
 * Ces deux cases sont le geste réel du patron, repris de son tableur. Le
 * statut n'est jamais écrit ici : le trigger `orders_before_update` le déduit
 * des deux drapeaux, et pose la date de retour réelle. Voir
 * `supabase/migrations/20260912140000_order_checks.sql`.
 *
 * Une seule case par appel. Envoyer les deux ensemble obligerait l'écran à
 * connaître l'état de l'autre au moment du clic — or deux téléphones peuvent
 * cocher chacun la sienne au même instant.
 */
export async function setOrderChecks(formData: FormData): Promise<ActionResult> {
  const locale = resolveLocale(formData.get("locale"));

  const profile = await getProfile();
  if (!profile) return { ok: false, error: "errors.forbidden" };

  const orderId = Number(formData.get("id"));
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return { ok: false, error: "errors.generic" };
  }

  const field = String(formData.get("field"));
  if (field !== "picked_up" && field !== "returned") {
    return { ok: false, error: "errors.generic" };
  }

  const value = formData.get("value") === "1";
  // Objet littéral plutôt qu'une clé calculée : le type de la colonne reste
  // vérifié par TypeScript.
  const patch = field === "picked_up" ? { picked_up: value } : { returned: value };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .update(patch)
    .eq("id", orderId)
    .select("id");

  if (error) return { ok: false, error: "errors.generic" };

  // Une écriture refusée par la RLS ne lève pas d'erreur : elle ne touche
  // simplement aucune ligne. Sans ce contrôle, l'écran afficherait une case
  // cochée que la base n'a jamais acceptée.
  if (!data?.length) return { ok: false, error: "errors.forbidden" };

  revalidatePath(`/${locale}/commandes`, "layout");
  revalidatePath(`/${locale}/commandes/${orderId}`);
  return { ok: true };
}

/**
 * Encaisse un versement — « il rend le costume et paie le reste ».
 *
 * Le geste le plus courant du comptoir, et le seul qui n'avait aucun chemin :
 * `amount_paid` ne s'écrivait qu'à la création. Le reste dû affiché sur la
 * fiche, dans la liste et dans les impayés du tableau de bord restait donc
 * celui du jour de la réservation.
 *
 * On envoie un MONTANT REÇU, jamais un nouveau total : l'employé tape ce que
 * le client lui tend. L'addition se fait dans la base — deux téléphones qui
 * encaissent en même temps s'additionnent au lieu de s'écraser. Voir
 * `supabase/migrations/20260912160000_order_payment.sql`.
 *
 * Un montant négatif est accepté : c'est le rattrapage d'une faute de frappe
 * sur un champ d'argent. Sans lui, un « 50000 » au lieu de « 5000 » resterait
 * faux pour toujours.
 */
export async function addOrderPayment(formData: FormData): Promise<ActionResult> {
  const locale = resolveLocale(formData.get("locale"));

  const profile = await getProfile();
  // Encaisser fait partie du métier quotidien : `staff` suffit.
  if (!profile) return { ok: false, error: "errors.forbidden" };

  const orderId = Number(formData.get("id"));
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return { ok: false, error: "errors.generic" };
  }

  const parsed = paymentSchema.safeParse({
    amount: formData.get("amount"),
    direction: formData.get("direction"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "errors.numberInvalid",
      field: "amount",
    };
  }

  // Le signe est porté par un choix explicite de l'écran, jamais par un « - »
  // tapé dans le champ : un signe moins invisible sur un montant serait la
  // pire des ambiguïtés.
  const delta = parsed.data.direction === "refund" ? -parsed.data.amount : parsed.data.amount;

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_order_payment", {
    p_order_id: orderId,
    p_amount: delta,
  });

  if (error) {
    // Chaque cas se corrige d'un geste différent : le dire vaut mieux qu'un
    // « une erreur est survenue » qui laisse l'employé sans issue.
    if (error.message.includes("payment_on_cancelled")) {
      return { ok: false, error: "errors.paymentOnCancelled" };
    }
    if (error.message.includes("payment_too_large")) {
      return { ok: false, error: "errors.paymentTooLarge", field: "amount" };
    }
    if (error.message.includes("payment_order_not_found")) {
      return { ok: false, error: "errors.notFound" };
    }
    return { ok: false, error: "errors.generic" };
  }

  // Le reste dû se lit à trois endroits, et le tableau de bord compte les
  // impayés : les quatre doivent bouger ensemble.
  revalidatePath(`/${locale}/commandes`, "layout");
  revalidatePath(`/${locale}/commandes/${orderId}`);
  revalidatePath(`/${locale}/tableau-de-bord`);
  return { ok: true };
}

/**
 * Caution rendue, ou reprise.
 *
 * La colonne s'affichait depuis le premier jour sans que rien ne puisse
 * l'écrire. C'est pourtant le second geste du retour, juste après
 * l'encaissement : le client rend les pièces, solde son reste, récupère sa
 * garantie.
 *
 * Écriture PostgREST ordinaire et non une fonction SQL : poser un booléen à
 * une valeur donnée est idempotent, deux téléphones qui le font en même temps
 * arrivent au même résultat. C'est l'ADDITION d'un versement qui exigeait la
 * base, pas ceci.
 */
export async function setCautionReturned(formData: FormData): Promise<ActionResult> {
  const locale = resolveLocale(formData.get("locale"));

  const profile = await getProfile();
  if (!profile) return { ok: false, error: "errors.forbidden" };

  const orderId = Number(formData.get("id"));
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return { ok: false, error: "errors.generic" };
  }

  const value = formData.get("value") === "1";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .update({ caution_returned: value })
    .eq("id", orderId)
    .select("id");

  if (error) return { ok: false, error: "errors.generic" };
  // Une écriture refusée par la RLS ne lève pas d'erreur : elle ne touche
  // simplement aucune ligne.
  if (!data?.length) return { ok: false, error: "errors.forbidden" };

  revalidatePath(`/${locale}/commandes/${orderId}`);
  return { ok: true };
}

/**
 * Annule une commande — ou la remet en service.
 *
 * C'est le seul geste qui LIBÈRE des pièces. Sans lui, une commande saisie par
 * erreur bloquait ses vestes indéfiniment : la contrainte d'exclusion faisait
 * son travail, et plus rien ne pouvait la desserrer.
 *
 * Aucune donnée ne se perd : la commande reste en base, ses lignes aussi, et le
 * tableau de bord l'écarte du chiffre d'affaires du seul fait de son statut
 * (`.neq("status", "annulee")`). C'est précisément ce qui distingue ce geste de
 * la suppression, réservée au propriétaire par la RLS.
 *
 * Tout se joue dans `set_order_cancelled` : la remise en service repasse par la
 * contrainte d'exclusion, donc échoue si la pièce a été relouée entre-temps —
 * en nommant laquelle. Voir `supabase/migrations/20260912120000_cancel_order.sql`.
 */
export async function setOrderCancelled(formData: FormData): Promise<ActionResult> {
  const locale = resolveLocale(formData.get("locale"));

  const profile = await getProfile();
  // Annuler fait partie du métier quotidien — un mariage se reporte. `staff`
  // suffit, comme pour la création ; c'est SUPPRIMER qui reste au propriétaire.
  if (!profile) return { ok: false, error: "errors.forbidden" };

  const orderId = Number(formData.get("id"));
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return { ok: false, error: "errors.generic" };
  }

  // Case cochée ou non : on ne déduit rien d'une valeur absente.
  const cancelled = formData.get("cancelled") === "1";

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_order_cancelled", {
    p_order_id: orderId,
    p_cancelled: cancelled,
  });

  if (error) {
    const conflict = unitConflict(error);
    if (conflict) return conflict;
    return { ok: false, error: "errors.generic" };
  }

  // La liste affiche le statut, la fiche l'affiche et change de boutons, et le
  // tableau de bord vient de changer de chiffre d'affaires.
  revalidatePath(`/${locale}/commandes`, "layout");
  revalidatePath(`/${locale}/commandes/${orderId}`);
  revalidatePath(`/${locale}/tableau-de-bord`);
  return { ok: true };
}

/**
 * Supprime DÉFINITIVEMENT une commande — propriétaire uniquement.
 *
 * À ne pas confondre avec l'annulation : l'annulation se défait, garde la
 * commande au registre et suffit pour un mariage reporté. La suppression est
 * pour la commande qui n'aurait jamais dû exister (doublon, saisie de test).
 *
 * Ce que la base fait d'elle-même, sans rien à écrire ici :
 *   - les lignes partent avec la commande (`on delete cascade`) et libèrent
 *     donc leurs pièces ;
 *   - les frais rattachés RESTENT dans les dépenses, détachés
 *     (`on delete set null`) : l'argent a bien été dépensé.
 *
 * Le contrôle de rôle est refait ici pour un message propre, mais c'est la
 * policy `orders_delete_owner` qui décide.
 */
export async function deleteOrder(formData: FormData): Promise<ActionResult> {
  const locale = resolveLocale(formData.get("locale"));

  const profile = await getProfile();
  if (!isOwner(profile)) return { ok: false, error: "errors.forbidden" };

  const orderId = Number(formData.get("id"));
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return { ok: false, error: "errors.generic" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .delete()
    .eq("id", orderId)
    .select("id");

  if (error) return { ok: false, error: "errors.generic" };
  // Une suppression refusée par la RLS ne lève pas d'erreur : elle n'efface
  // simplement rien. Sans ce contrôle, on redirigerait vers la liste en
  // laissant croire que la commande a disparu.
  if (!data?.length) return { ok: false, error: "errors.forbidden" };

  // La commande quitte la liste, le chiffre d'affaires, les échéances du
  // tableau de bord ; et ses frais perdent leur lien dans les dépenses.
  revalidatePath(`/${locale}/commandes`, "layout");
  revalidatePath(`/${locale}/tableau-de-bord`);
  revalidatePath(`/${locale}/depenses`);
  redirectTo("/commandes", locale);
}
