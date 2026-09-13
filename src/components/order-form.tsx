"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { flushSync } from "react-dom";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  AlertCircle,
  AlertTriangle,
  CalendarRange,
  Layers,
  Plus,
  Store,
  Trash2,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker, toCalendarDate } from "@/components/date-picker";
import { Spinner } from "@/components/ui/spinner";
import { OrderPiecePicker, type PickedUnit } from "@/components/order-piece-picker";
import {
  OrderEnsemblePicker,
  OrderExternalPicker,
  type ExternalDraft,
} from "@/components/order-extra-pickers";
import { checkAvailability, createOrder } from "@/lib/actions/orders";
import {
  linesSubtotal,
  packageDiscount,
  resolveUnitPrice,
  toPayload,
  unitIdsIn,
  type DraftLine,
} from "@/lib/order-draft";
import { fieldErrorsOf, orderSchema } from "@/lib/validation/orders";
import { defaultWindow } from "@/lib/rental-range";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  PickerEnsemble,
  PickerModel,
  Settings,
  Unavailability,
} from "@/lib/queries/orders";
import type { Locale } from "@/i18n/routing";

/** Une erreur à afficher : une clé i18n, et ses valeurs éventuelles. */
type FieldIssue = { key: string; values?: Record<string, string> };
type Issues = Partial<Record<string, FieldIssue>>;

/**
 * Ordre des champs À L'ÉCRAN, de haut en bas, avec l'élément qui reçoit le
 * focus. C'est lui qui décide vers quel champ on défile quand l'envoi échoue :
 * le premier fautif dans l'ordre de lecture, pas dans l'ordre du schéma.
 */
const FIELD_TARGETS = [
  ["customer_name", "customer_input"],
  ["customer_phone", "phone_input"],
  ["event_date", "event_date_input"],
  ["pickup_date", "pickup_input"],
  ["return_due_date", "return_input"],
  ["lines", "section-pieces"],
  ["discount", "discount"],
  ["amount_paid", "amount_paid"],
  ["caution_amount", "caution_amount"],
  ["notes", "notes"],
] as const;

/**
 * Saisie d'une commande — UNE page qui défile.
 *
 * Elle remplace un assistant en trois étapes (« Suivant », « Suivant »,
 * « Créer ») que le client a refusé à l'usage : on ne voyait jamais la
 * commande entière, et une erreur découverte à la dernière étape renvoyait en
 * arrière sans dire où. Ici tout est visible, les champs obligatoires sont
 * marqués d'un astérisque, et chaque erreur s'affiche SOUS son champ.
 *
 * Ce que les étapes imposaient par leur ordre est désormais dit en clair : on
 * ne peut pas ajouter de pièce avant d'avoir la date, car la disponibilité
 * n'a pas de sens sans elle.
 */
export function OrderForm({
  models,
  ensembles,
  settings,
}: {
  models: PickerModel[];
  ensembles: PickerEnsemble[];
  settings: Settings;
}) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const [isPending, startTransition] = useTransition();
  const [isChecking, startChecking] = useTransition();

  // --- client et dates -----------------------------------------------------
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [datesTouched, setDatesTouched] = useState(false);
  const [pickup, setPickup] = useState("");
  const [returnDue, setReturnDue] = useState("");
  const [showDates, setShowDates] = useState(false);

  // --- pièces --------------------------------------------------------------
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [unavailable, setUnavailable] = useState<Map<number, Unavailability>>(new Map());
  const [piecesOpen, setPiecesOpen] = useState(false);
  const [ensemblesOpen, setEnsemblesOpen] = useState(false);
  const [externalOpen, setExternalOpen] = useState(false);
  /** Compteur de requêtes : une réponse périmée ne doit pas écraser la dernière. */
  const availabilityRequest = useRef(0);

  // --- montants ------------------------------------------------------------
  const [discount, setDiscount] = useState("0");
  // VIDES, et non « 0 » : ces deux champs sont obligatoires. Pré-remplis à 0,
  // l'obligation ne voudrait plus rien dire — on ne distinguerait plus « rien
  // versé » d'« oublié de demander ».
  const [amountPaid, setAmountPaid] = useState("");
  const [caution, setCaution] = useState("");
  const [notes, setNotes] = useState("");

  // --- erreurs -------------------------------------------------------------
  /** Rien ne s'affiche avant le premier envoi : on ne crie pas pendant la frappe. */
  const [attempted, setAttempted] = useState(false);
  /** Ce que seul le serveur sait : conflit de réservation, erreur générique. */
  const [serverIssue, setServerIssue] = useState<FieldIssue | null>(null);
  /** Erreur sans champ (réseau, droits) : un bandeau au-dessus du bouton. */
  const [generalError, setGeneralError] = useState<FieldIssue | null>(null);

  const unitsById = useMemo(() => {
    const map = new Map<number, { model: PickerModel; unit: PickerModel["units"][number] }>();
    for (const model of models) {
      for (const unit of model.units) map.set(unit.id, { model, unit });
    }
    return map;
  }, [models]);

  const picked = useMemo(() => unitIdsIn(lines), [lines]);
  const subtotal = linesSubtotal(lines);
  const total = Math.max(subtotal - (Number(discount) || 0), 0);
  const balance = total - (Number(amountPaid) || 0);
  const windowValid = Boolean(pickup && returnDue && returnDue >= pickup);

  /** Lignes du brouillon devenues indisponibles après un changement de dates. */
  const takenLines = lines.filter(
    (l): l is Extract<DraftLine, { kind: "unit" }> =>
      l.kind === "unit" && unavailable.has(l.unitId),
  );

  /**
   * Le brouillon passé au MÊME schéma que la Server Action.
   *
   * Calculé à chaque rendu une fois le premier envoi tenté, et non stocké :
   * une erreur disparaît donc à l'instant où le champ est corrigé, sans effet
   * de synchronisation à maintenir.
   */
  function collectIssues(): Issues {
    const parsed = orderSchema.safeParse({
      customer_name: customerName,
      customer_phone: customerPhone,
      event_date: eventDate,
      pickup_date: pickup,
      return_due_date: returnDue,
      discount: discount || 0,
      amount_paid: amountPaid,
      caution_amount: caution,
      notes,
      lines: toPayload(lines),
    });

    const issues: Issues = {};
    if (!parsed.success) {
      for (const [field, key] of Object.entries(fieldErrorsOf(parsed.error))) {
        issues[field] = { key };
      }
    }

    // Sans date d'événement, retrait et retour sont vides par construction :
    // les signaler aussi ferait trois erreurs pour un seul oubli.
    if (issues.event_date) {
      delete issues.pickup_date;
      delete issues.return_due_date;
    }

    if (!issues.lines && takenLines.length > 0) {
      issues.lines = {
        key: "errors.linesTaken",
        values: { count: formatNumber(takenLines.length, locale) },
      };
    }

    return issues;
  }

  const issues: Issues = attempted ? collectIssues() : {};
  if (serverIssue && !issues.lines) issues.lines = serverIssue;
  const issueCount = Object.keys(issues).length;

  const issueText = (field: string) => {
    const issue = issues[field];
    return issue ? t(issue.key, issue.values) : null;
  };

  /**
   * Relit les pièces prises sur la fenêtre. Appelée par les GESTES qui
   * changent les dates, pas par un effet : c'est le geste qui fait la requête.
   *
   * Ceci ne décide rien — la contrainte `EXCLUDE` tranche à l'écriture. On
   * grise, et on prévient si une pièce déjà ajoutée n'est plus libre.
   */
  function refreshAvailability(nextPickup: string, nextReturn: string) {
    if (!nextPickup || !nextReturn || nextReturn < nextPickup) return;
    const request = ++availabilityRequest.current;
    startChecking(async () => {
      const busy = await checkAvailability(nextPickup, nextReturn);
      if (request !== availabilityRequest.current) return;
      setUnavailable(new Map(busy.map((b) => [b.unitId, b])));
    });
  }

  /**
   * La date de l'événement pilote tout. Le client n'en saisit qu'une — l'app en
   * déduit retrait et retour, comme le trigger `orders_default_window` le fera
   * de son côté si on ne les envoie pas.
   */
  function onEventDateChange(value: string) {
    setEventDate(value);
    setServerIssue(null);
    if (!value || datesTouched) {
      refreshAvailability(pickup, returnDue);
      return;
    }
    const w = defaultWindow(value, settings.days_before_event, settings.days_after_event);
    setPickup(w.pickup);
    setReturnDue(w.returnDue);
    refreshAvailability(w.pickup, w.returnDue);
  }

  function onPickupChange(value: string) {
    setDatesTouched(true);
    setPickup(value);
    setServerIssue(null);
    refreshAvailability(value, returnDue);
  }

  function onReturnChange(value: string) {
    setDatesTouched(true);
    setReturnDue(value);
    setServerIssue(null);
    refreshAvailability(pickup, value);
  }

  function addUnit(u: PickedUnit) {
    setServerIssue(null);
    setLines((prev) =>
      prev.some((l) => l.kind === "unit" && l.unitId === u.unitId)
        ? prev
        : [
            ...prev,
            {
              kind: "unit",
              unitId: u.unitId,
              unitPrice: u.unitPrice,
              note: null,
              modelName: u.modelName,
              refCode: u.refCode,
              size: u.size,
            },
          ],
    );
    setPiecesOpen(false);
  }

  /**
   * Ajouter un ensemble = ajouter ses pièces, une ligne chacune. On saute
   * celles qui sont déjà prises sur ces dates plutôt que de les ajouter pour
   * les voir refusées à la validation.
   */
  function addEnsemble(ensemble: PickerEnsemble) {
    setServerIssue(null);
    const added: DraftLine[] = [];
    for (const unitId of ensemble.unit_ids) {
      if (picked.has(unitId)) continue;
      if (unavailable.has(unitId)) continue;
      const entry = unitsById.get(unitId);
      if (!entry || entry.unit.status !== "disponible") continue;
      added.push({
        kind: "unit",
        unitId,
        unitPrice: resolveUnitPrice(entry.model, entry.unit),
        note: null,
        modelName:
          (locale === "ar" ? entry.model.name_ar : entry.model.name_fr) ||
          entry.model.name_fr,
        refCode: entry.unit.ref_code,
        size: entry.unit.size,
      });
    }

    setLines((prev) => [...prev, ...added]);

    // Le forfait de l'ensemble se porte en REMISE : chaque ligne garde son vrai
    // prix, et `subtotal` reste la somme des lignes — ce que le trigger impose
    // de toute façon.
    if (ensemble.package_price !== null && added.length === ensemble.unit_ids.length) {
      const raw = linesSubtotal(added);
      const d = packageDiscount(ensemble.package_price, raw);
      if (d > 0) setDiscount(String((Number(discount) || 0) + d));
    }

    setEnsemblesOpen(false);
  }

  function addExternal(draft: ExternalDraft) {
    setServerIssue(null);
    setLines((prev) => [
      ...prev,
      {
        kind: "external",
        source: draft.source.trim() || null,
        label: draft.label.trim(),
        cost: draft.cost === "" ? null : Number(draft.cost),
        unitPrice: draft.unitPrice === "" ? 0 : Number(draft.unitPrice),
        note: null,
      },
    ]);
    setExternalOpen(false);
  }

  function removeLine(index: number) {
    setServerIssue(null);
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  function setLinePrice(index: number, value: string) {
    setLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, unitPrice: Number(value) || 0 } : l)),
    );
  }

  /**
   * Défile jusqu'au PREMIER champ fautif dans l'ordre de lecture et lui donne
   * le focus. `flushSync` d'abord : le panneau des dates doit être rendu avant
   * qu'on cherche son champ dans le DOM.
   */
  function revealFirst(found: Issues) {
    flushSync(() => {
      setAttempted(true);
      if (found.pickup_date || found.return_due_date) setShowDates(true);
    });
    const target = FIELD_TARGETS.find(([field]) => found[field]);
    const el = target ? document.getElementById(target[1]) : null;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus({ preventScroll: true });
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = collectIssues();
    if (Object.keys(found).length > 0) {
      revealFirst(found);
      return;
    }

    setServerIssue(null);
    setGeneralError(null);
    const formData = new FormData(event.currentTarget);
    formData.set("lines", JSON.stringify(toPayload(lines)));

    startTransition(async () => {
      const result = await createOrder(formData);
      // Succès = redirection : on n'arrive ici que sur erreur.
      if (!result || result.ok) return;

      // Une pièce réservée par un collègue entre l'affichage et l'envoi : on
      // relit la disponibilité pour que la ligne fautive se marque d'elle-même,
      // et on ramène l'employé sur les pièces.
      if (result.error.startsWith("errors.unitUnavailable")) {
        refreshAvailability(pickup, returnDue);
        setServerIssue({ key: result.error, values: result.values });
        revealFirst({ lines: { key: result.error } });
        return;
      }

      if (result.fieldErrors && Object.keys(result.fieldErrors).length > 0) {
        const fromServer: Issues = {};
        for (const [field, key] of Object.entries(result.fieldErrors)) {
          fromServer[field] = { key };
        }
        revealFirst(fromServer);
        return;
      }

      setGeneralError({ key: result.error, values: result.values });
    });
  }

  const windowLabel = windowValid
    ? t("orders.window", {
        pickup: formatDate(pickup, locale),
        returnDue: formatDate(returnDue, locale),
      })
    : "";

  return (
    <form onSubmit={onSubmit} noValidate>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="event_date" value={eventDate} />
      <input type="hidden" name="pickup_date" value={pickup} />
      <input type="hidden" name="return_due_date" value={returnDue} />
      <input type="hidden" name="customer_name" value={customerName} />
      <input type="hidden" name="customer_phone" value={customerPhone} />

      <p className="text-muted-foreground mb-6 text-sm">
        <RequiredMark /> {t("orders.requiredLegend")}
      </p>

      {/* --- 1. Client ------------------------------------------------------ */}
      <Section id="section-client" title={t("orders.customer")}>
        <FieldGroup>
          <Field data-invalid={!!issues.customer_name || undefined}>
            <FieldLabel htmlFor="customer_input">
              {t("orders.customerName")}
              <RequiredMark />
            </FieldLabel>
            <Input
              id="customer_input"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="h-12 text-base"
              autoComplete="name"
              aria-required
              aria-invalid={!!issues.customer_name || undefined}
            />
            {issues.customer_name && <FieldError>{issueText("customer_name")}</FieldError>}
          </Field>

          <Field data-invalid={!!issues.customer_phone || undefined}>
            <FieldLabel htmlFor="phone_input">
              {t("orders.phone")}
              <RequiredMark />
            </FieldLabel>
            <Input
              id="phone_input"
              type="tel"
              inputMode="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="h-12 text-base"
              autoComplete="tel"
              dir="ltr"
              aria-required
              aria-invalid={!!issues.customer_phone || undefined}
            />
            <FieldDescription>{t("orders.phoneHint")}</FieldDescription>
            {issues.customer_phone && <FieldError>{issueText("customer_phone")}</FieldError>}
          </Field>
        </FieldGroup>
      </Section>

      {/* --- 2. Date -------------------------------------------------------- */}
      <Section id="section-date" title={t("orders.sectionDate")}>
        <FieldGroup>
          <Field data-invalid={!!issues.event_date || undefined}>
            <FieldLabel htmlFor="event_date_input">
              {t("orders.eventDate")}
              <RequiredMark />
            </FieldLabel>
            <DatePicker
              id="event_date_input"
              value={eventDate}
              onChange={onEventDateChange}
              placeholder={t("common.pickDate")}
              invalid={!!issues.event_date}
            />
            <FieldDescription>{t("orders.eventDateHint")}</FieldDescription>
            {issues.event_date && <FieldError>{issueText("event_date")}</FieldError>}
          </Field>

          {eventDate && (
            <div className="border-border bg-muted/40 rounded-lg border p-3">
              {windowLabel && (
                <p className="flex items-center gap-2 text-sm">
                  <CalendarRange className="text-gold-strong size-4 shrink-0" aria-hidden />
                  <span className="tabular">{windowLabel}</span>
                </p>
              )}

              <button
                type="button"
                onClick={() => setShowDates((v) => !v)}
                aria-expanded={showDates}
                className="text-gold-strong mt-2 min-h-11 text-sm underline underline-offset-4"
              >
                {t("orders.editDates")}
              </button>

              {showDates && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field data-invalid={!!issues.pickup_date || undefined}>
                    <FieldLabel htmlFor="pickup_input">{t("orders.pickupDate")}</FieldLabel>
                    <DatePicker
                      id="pickup_input"
                      value={pickup}
                      onChange={onPickupChange}
                      placeholder={t("common.pickDate")}
                      invalid={!!issues.pickup_date}
                      // Le retrait ne peut pas suivre le retour.
                      disabledDays={returnDue ? { after: toCalendarDate(returnDue) } : undefined}
                    />
                    {issues.pickup_date && <FieldError>{issueText("pickup_date")}</FieldError>}
                  </Field>

                  <Field data-invalid={!!issues.return_due_date || undefined}>
                    <FieldLabel htmlFor="return_input">{t("orders.returnDate")}</FieldLabel>
                    <DatePicker
                      id="return_input"
                      value={returnDue}
                      onChange={onReturnChange}
                      placeholder={t("common.pickDate")}
                      invalid={!!issues.return_due_date}
                      disabledDays={pickup ? { before: toCalendarDate(pickup) } : undefined}
                    />
                    {issues.return_due_date && (
                      <FieldError>{issueText("return_due_date")}</FieldError>
                    )}
                  </Field>
                </div>
              )}
            </div>
          )}
        </FieldGroup>
      </Section>

      {/* --- 3. Pièces ------------------------------------------------------ */}
      <Section
        id="section-pieces"
        title={
          <>
            {t("orders.pieces")}
            <RequiredMark />
          </>
        }
        invalid={!!issues.lines}
        aside={isChecking ? <Spinner className="text-muted-foreground" /> : null}
      >
        {/* Les pièces AVANT la date n'ont pas de sens : la disponibilité se
            calcule sur une fenêtre. L'assistant l'imposait par l'ordre des
            étapes ; une page unique doit le dire en clair. */}
        {!windowValid && (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <CalendarRange className="size-4 shrink-0" aria-hidden />
            {t("orders.pickDateFirst")}
          </p>
        )}

        {lines.length === 0 ? (
          windowValid && (
            <div className="border-border rounded-lg border border-dashed px-6 py-8 text-center">
              <p className="font-medium">{t("orders.noLines")}</p>
              <p className="text-muted-foreground mt-1 text-sm">{t("orders.noLinesHint")}</p>
            </div>
          )
        ) : (
          <ul className="space-y-2">
            {lines.map((line, i) => (
              <li key={line.kind === "unit" ? `u${line.unitId}` : `e${i}`}>
                <LineCard
                  line={line}
                  locale={locale}
                  taken={line.kind === "unit" ? unavailable.get(line.unitId) : undefined}
                  onRemove={() => removeLine(i)}
                  onPrice={(v) => setLinePrice(i, v)}
                />
              </li>
            ))}
          </ul>
        )}

        {issues.lines && (
          <p role="alert" className="text-destructive mt-3 text-sm">
            {issueText("lines")}
          </p>
        )}

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => setPiecesOpen(true)}
            disabled={!windowValid}
            className="h-12 text-base"
          >
            <Plus className="size-4" aria-hidden />
            {t("orders.addPiece")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setEnsemblesOpen(true)}
            disabled={!windowValid}
            className="h-12 text-base"
          >
            <Layers className="size-4" aria-hidden />
            {t("orders.addEnsemble")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setExternalOpen(true)}
            disabled={!windowValid}
            className="h-12 text-base"
          >
            <Store className="size-4" aria-hidden />
            {t("orders.addExternal")}
          </Button>
        </div>

        {lines.length > 0 && (
          <p className="text-muted-foreground mt-4 flex items-center justify-between text-sm">
            <span>{t("orders.subtotal")}</span>
            <span className="tabular text-foreground font-medium">
              {formatMoney(subtotal, locale)}
            </span>
          </p>
        )}
      </Section>

      {/* --- 4. Montants ---------------------------------------------------- */}
      <Section id="section-amounts" title={t("orders.amounts")}>
        <FieldGroup>
          <Field data-invalid={!!issues.discount || undefined}>
            <FieldLabel htmlFor="discount">{t("orders.discount")}</FieldLabel>
            <Input
              id="discount"
              name="discount"
              type="number"
              inputMode="numeric"
              min={0}
              step={100}
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              className="h-12 text-base"
              aria-invalid={!!issues.discount || undefined}
            />
            {issues.discount && <FieldError>{issueText("discount")}</FieldError>}
          </Field>

          <Field data-invalid={!!issues.amount_paid || undefined}>
            <FieldLabel htmlFor="amount_paid">
              {t("orders.paid")}
              <RequiredMark />
            </FieldLabel>
            <Input
              id="amount_paid"
              name="amount_paid"
              type="number"
              inputMode="numeric"
              min={0}
              step={100}
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
              className="h-12 text-base"
              aria-required
              aria-invalid={!!issues.amount_paid || undefined}
            />
            <FieldDescription>{t("orders.zeroAllowed")}</FieldDescription>
            {issues.amount_paid && <FieldError>{issueText("amount_paid")}</FieldError>}
          </Field>

          <Field data-invalid={!!issues.caution_amount || undefined}>
            <FieldLabel htmlFor="caution_amount">
              {t("orders.caution")}
              <RequiredMark />
            </FieldLabel>
            <Input
              id="caution_amount"
              name="caution_amount"
              type="number"
              inputMode="numeric"
              min={0}
              step={100}
              value={caution}
              onChange={(e) => setCaution(e.target.value)}
              className="h-12 text-base"
              aria-required
              aria-invalid={!!issues.caution_amount || undefined}
            />
            <FieldDescription>{t("orders.cautionNotRevenue")}</FieldDescription>
            {issues.caution_amount && <FieldError>{issueText("caution_amount")}</FieldError>}
          </Field>
        </FieldGroup>
      </Section>

      {/* --- 5. Note -------------------------------------------------------- */}
      <Section id="section-note" title={t("orders.notesTitle")}>
        <Field data-invalid={!!issues.notes || undefined}>
          <FieldLabel htmlFor="notes" className="sr-only">
            {t("orders.notesTitle")}
          </FieldLabel>
          <Textarea
            id="notes"
            name="notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="text-base"
          />
          {issues.notes && <FieldError>{issueText("notes")}</FieldError>}
        </Field>
      </Section>

      {generalError && (
        <Alert variant="destructive" className="mt-6">
          <AlertCircle />
          <AlertDescription>{t(generalError.key, generalError.values)}</AlertDescription>
        </Alert>
      )}

      {/* BARRE D'ACTION COLLANTE — au-dessus de la barre d'onglets sur
          téléphone (`bottom-above-nav`), pas dessous comme l'ancien assistant.
          Elle porte le total et le reste : l'employé voit le montant bouger
          pendant qu'il défile, sans devoir descendre jusqu'en bas. */}
      <div className="bg-background border-border bottom-above-nav sticky z-30 mt-8 border-t py-3 md:bottom-0">
        <div className="mb-3 flex items-baseline justify-between gap-4 text-sm">
          <span className="text-muted-foreground">
            {t("orders.total")}{" "}
            <span className="tabular text-foreground text-base font-medium">
              {formatMoney(total, locale)}
            </span>
          </span>
          <span className="text-muted-foreground">
            {t("orders.balance")}{" "}
            <span
              className={cn(
                "tabular font-medium",
                balance > 0 ? "text-warning-foreground" : "text-foreground",
              )}
            >
              {formatMoney(balance, locale)}
            </span>
          </span>
        </div>

        {issueCount > 0 && (
          <p className="text-destructive mb-2 flex items-center gap-2 text-sm" role="status">
            <AlertCircle className="size-4 shrink-0" aria-hidden />
            {t("orders.fieldsToFix", { count: formatNumber(issueCount, locale) })}
          </p>
        )}

        <Button type="submit" disabled={isPending} className="h-12 w-full text-base">
          {isPending && <Spinner />}
          {t("orders.create")}
        </Button>
      </div>

      <OrderPiecePicker
        open={piecesOpen}
        onOpenChange={setPiecesOpen}
        models={models}
        unavailable={unavailable}
        alreadyPicked={picked}
        onPick={addUnit}
      />
      <OrderEnsemblePicker
        open={ensemblesOpen}
        onOpenChange={setEnsemblesOpen}
        ensembles={ensembles}
        onPick={addEnsemble}
      />
      <OrderExternalPicker
        open={externalOpen}
        onOpenChange={setExternalOpen}
        onAdd={addExternal}
      />
    </form>
  );
}

/**
 * L'astérisque des champs obligatoires. `aria-hidden` : le lecteur d'écran
 * entend « obligatoire » par `aria-required`, et non « étoile ».
 */
function RequiredMark() {
  return (
    <span className="text-destructive ms-0.5" aria-hidden>
      *
    </span>
  );
}

/**
 * Une section de la page. Filet en tête plutôt qu'une carte : sur 390 px, des
 * cartes empilées mangent la largeur de leurs marges intérieures.
 *
 * `tabIndex={-1}` : la section des pièces n'a pas de champ à focaliser quand
 * elle est en erreur — c'est la section elle-même qui reçoit le focus.
 */
function Section({
  id,
  title,
  aside,
  invalid,
  children,
}: {
  id: string;
  title: React.ReactNode;
  aside?: React.ReactNode;
  invalid?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      tabIndex={-1}
      aria-labelledby={`${id}-title`}
      className="border-border scroll-mt-20 border-t pt-5 pb-6 outline-none first-of-type:border-t-0 first-of-type:pt-0"
    >
      <div className="mb-4 flex items-center gap-2">
        <h2
          id={`${id}-title`}
          className={cn("text-lg font-medium", invalid && "text-destructive")}
        >
          {title}
        </h2>
        {aside && <span className="ms-auto">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

function LineCard({
  line,
  locale,
  taken,
  onRemove,
  onPrice,
}: {
  line: DraftLine;
  locale: Locale;
  /** La pièce est prise sur les dates ACTUELLES : les dates ont changé depuis l'ajout. */
  taken?: Unavailability;
  onRemove: () => void;
  onPrice: (value: string) => void;
}) {
  const t = useTranslations();

  return (
    <div className={cn("rounded-lg border p-3", taken ? "border-warning" : "border-border")}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {line.kind === "unit" ? (
            <>
              <p className="truncate font-medium">{line.modelName}</p>
              <p className="text-muted-foreground truncate text-sm">
                <bdi>{line.refCode}</bdi>
                {line.size && ` · ${t("stock.size")} ${line.size}`}
              </p>
            </>
          ) : (
            <>
              <p className="truncate font-medium">{line.label}</p>
              <p className="text-muted-foreground truncate text-sm">
                <Store className="me-1 inline size-3" aria-hidden />
                {line.source ?? t("stock.external")}
                {line.cost !== null && ` · ${formatMoney(line.cost, locale)}`}
              </p>
            </>
          )}

          {/* Le mot porte l'information, pas la seule bordure colorée. */}
          {taken && (
            <p className="text-warning-foreground mt-1 flex items-center gap-1.5 text-sm font-medium">
              <AlertTriangle className="size-4 shrink-0" aria-hidden />
              {taken.freeFrom
                ? t("orders.freeFrom", { date: formatDate(taken.freeFrom, locale) })
                : t("orders.takenOnDates")}
            </p>
          )}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive size-11 shrink-0"
        >
          <Trash2 className="size-4" aria-hidden />
          <span className="sr-only">{t("orders.removeLine")}</span>
        </Button>
      </div>

      {/* Quatrième et dernier niveau de prix : ce que l'employé a réellement
          négocié avec le client, toujours modifiable. */}
      <div className="mt-2 flex items-center gap-2">
        <span className="text-muted-foreground text-sm" aria-hidden>
          {t("orders.linePrice")}
        </span>
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          step={100}
          value={String(line.unitPrice)}
          onChange={(e) => onPrice(e.target.value)}
          aria-label={t("orders.linePrice")}
          className="tabular h-11 max-w-36 text-base"
        />
      </div>
    </div>
  );
}
