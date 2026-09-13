"use client";

import { useMemo, useState, useTransition } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
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
import { Spinner } from "@/components/ui/spinner";
import { Separator } from "@/components/ui/separator";
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
import { defaultWindow } from "@/lib/rental-range";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  PickerEnsemble,
  PickerModel,
  Settings,
  Unavailability,
} from "@/lib/queries/orders";
import type { Locale } from "@/i18n/routing";

const TOTAL_STEPS = 3;

export function OrderWizard({
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

  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [errorValues, setErrorValues] = useState<Record<string, string> | undefined>();
  const [field, setField] = useState<string | null>(null);

  // --- étape 1 -------------------------------------------------------------
  const [eventDate, setEventDate] = useState("");
  const [datesTouched, setDatesTouched] = useState(false);
  const [pickup, setPickup] = useState("");
  const [returnDue, setReturnDue] = useState("");
  const [showDates, setShowDates] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  // --- étape 2 -------------------------------------------------------------
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [unavailable, setUnavailable] = useState<Map<number, Unavailability>>(new Map());
  const [piecesOpen, setPiecesOpen] = useState(false);
  const [ensemblesOpen, setEnsemblesOpen] = useState(false);
  const [externalOpen, setExternalOpen] = useState(false);

  // --- étape 3 -------------------------------------------------------------
  const [discount, setDiscount] = useState("0");
  const [amountPaid, setAmountPaid] = useState("0");
  const [caution, setCaution] = useState("0");
  const [notes, setNotes] = useState("");

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

  /**
   * La date de l'événement pilote tout. Le client n'en saisit qu'une — l'app en
   * déduit retrait et retour, comme le trigger `orders_default_window` le fera
   * de son côté si on ne les envoie pas.
   */
  function onEventDateChange(value: string) {
    setEventDate(value);
    if (!value || datesTouched) return;
    const w = defaultWindow(value, settings.days_before_event, settings.days_after_event);
    setPickup(w.pickup);
    setReturnDue(w.returnDue);
  }

  function goToPieces() {
    setError(null);
    setField(null);

    if (!eventDate) {
      setError("errors.required");
      setField("event_date");
      return;
    }
    if (!customerName.trim()) {
      setError("errors.required");
      setField("customer_name");
      return;
    }
    if (returnDue < pickup) {
      setError("errors.datesIncoherent");
      setField("return_due_date");
      return;
    }

    // La disponibilité n'a de sens qu'une fois les dates connues : c'est
    // pourquoi cette étape vient en premier.
    startChecking(async () => {
      const busy = await checkAvailability(pickup, returnDue);
      setUnavailable(new Map(busy.map((b) => [b.unitId, b])));
      setStep(2);
    });
  }

  function addUnit(u: PickedUnit) {
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
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  function setLinePrice(index: number, value: string) {
    setLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, unitPrice: Number(value) || 0 } : l)),
    );
  }

  function submit(formData: FormData) {
    setError(null);
    setErrorValues(undefined);
    setField(null);
    formData.set("lines", JSON.stringify(toPayload(lines)));
    startTransition(async () => {
      const result = await createOrder(formData);
      // Succès = redirection : on n'arrive ici que sur erreur.
      if (result && !result.ok) {
        setError(result.error);
        setErrorValues(result.values);
        setField(result.field ?? null);
        // Une pièce devenue indisponible entre l'affichage et la validation :
        // on renvoie l'employé sur la liste des pièces, sinon il ne voit pas
        // ce qu'il doit corriger.
        if (result.error.startsWith("errors.unitUnavailable")) setStep(2);
      }
    });
  }

  const windowLabel =
    pickup && returnDue
      ? t("orders.window", {
          pickup: formatDate(pickup, locale),
          returnDue: formatDate(returnDue, locale),
        })
      : "";

  return (
    <form action={submit} noValidate>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="event_date" value={eventDate} />
      <input type="hidden" name="pickup_date" value={pickup} />
      <input type="hidden" name="return_due_date" value={returnDue} />
      <input type="hidden" name="customer_name" value={customerName} />
      <input type="hidden" name="customer_phone" value={customerPhone} />

      <Stepper step={step} />

      {step === 1 && (
        <FieldGroup>
          <Field data-invalid={field === "event_date" || undefined}>
            <FieldLabel htmlFor="event_date_input">{t("orders.eventDate")}</FieldLabel>
            <Input
              id="event_date_input"
              type="date"
              value={eventDate}
              onChange={(e) => onEventDateChange(e.target.value)}
              className="h-12 text-base"
            />
            <FieldDescription>{t("orders.eventDateHint")}</FieldDescription>
            {field === "event_date" && error && <FieldError>{t(error)}</FieldError>}
          </Field>

          {eventDate && (
            <div className="border-border bg-muted/40 rounded-lg border p-3">
              <p className="flex items-center gap-2 text-sm">
                <CalendarRange className="text-gold-strong size-4 shrink-0" aria-hidden />
                <span className="tabular">{windowLabel}</span>
              </p>

              <button
                type="button"
                onClick={() => setShowDates((v) => !v)}
                className="text-gold-strong mt-2 min-h-9 text-sm underline underline-offset-4"
              >
                {t("orders.editDates")}
              </button>

              {showDates && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="pickup_input">{t("orders.pickupDate")}</FieldLabel>
                    <Input
                      id="pickup_input"
                      type="date"
                      value={pickup}
                      onChange={(e) => {
                        setDatesTouched(true);
                        setPickup(e.target.value);
                      }}
                      className="h-12 text-base"
                    />
                  </Field>

                  <Field data-invalid={field === "return_due_date" || undefined}>
                    <FieldLabel htmlFor="return_input">{t("orders.returnDate")}</FieldLabel>
                    <Input
                      id="return_input"
                      type="date"
                      value={returnDue}
                      onChange={(e) => {
                        setDatesTouched(true);
                        setReturnDue(e.target.value);
                      }}
                      className="h-12 text-base"
                    />
                    {field === "return_due_date" && error && (
                      <FieldError>{t(error)}</FieldError>
                    )}
                  </Field>
                </div>
              )}
            </div>
          )}

          <Field data-invalid={field === "customer_name" || undefined}>
            <FieldLabel htmlFor="customer_input">{t("orders.customer")}</FieldLabel>
            <Input
              id="customer_input"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="h-12 text-base"
              autoComplete="name"
            />
            {field === "customer_name" && error && <FieldError>{t(error)}</FieldError>}
          </Field>

          <Field>
            <FieldLabel htmlFor="phone_input">{t("orders.phone")}</FieldLabel>
            <Input
              id="phone_input"
              type="tel"
              inputMode="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="h-12 text-base"
              autoComplete="tel"
              dir="ltr"
            />
          </Field>
        </FieldGroup>
      )}

      {step === 2 && (
        <div>
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <CalendarRange className="size-4 shrink-0" aria-hidden />
            <span className="tabular">{windowLabel}</span>
          </p>

          {lines.length === 0 ? (
            <div className="border-border mt-4 rounded-lg border border-dashed px-6 py-10 text-center">
              <p className="font-medium">{t("orders.noLines")}</p>
              <p className="text-muted-foreground mt-1 text-sm">
                {t("orders.noLinesHint")}
              </p>
            </div>
          ) : (
            <ul className="mt-4 space-y-2">
              {lines.map((line, i) => (
                <li key={line.kind === "unit" ? `u${line.unitId}` : `e${i}`}>
                  <LineCard
                    line={line}
                    locale={locale}
                    onRemove={() => removeLine(i)}
                    onPrice={(v) => setLinePrice(i, v)}
                  />
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPiecesOpen(true)}
              className="h-12 text-base"
            >
              <Plus className="size-4" aria-hidden />
              {t("orders.addPiece")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEnsemblesOpen(true)}
              className="h-12 text-base"
            >
              <Layers className="size-4" aria-hidden />
              {t("orders.addEnsemble")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setExternalOpen(true)}
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
        </div>
      )}

      {step === 3 && (
        <FieldGroup>
          <Field>
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
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="amount_paid">{t("orders.paid")}</FieldLabel>
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
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="caution_amount">{t("orders.caution")}</FieldLabel>
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
            />
            <FieldDescription>{t("orders.cautionNotRevenue")}</FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="notes">{t("orders.summary")}</FieldLabel>
            <Textarea
              id="notes"
              name="notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="text-base"
            />
          </Field>

          <Separator />

          <dl className="space-y-2 text-sm">
            <Row label={t("orders.subtotal")} value={formatMoney(subtotal, locale)} />
            <Row
              label={t("orders.discount")}
              value={formatMoney(Number(discount) || 0, locale)}
            />
            <Row
              label={t("orders.total")}
              value={formatMoney(total, locale)}
              strong
            />
            <Row label={t("orders.paid")} value={formatMoney(Number(amountPaid) || 0, locale)} />
            <Row
              label={t("orders.balance")}
              value={formatMoney(balance, locale)}
              warning={balance > 0}
            />
          </dl>
        </FieldGroup>
      )}

      {error && !field && (
        <Alert variant="destructive" className="mt-4">
          <AlertCircle />
          <AlertDescription>{t(error, errorValues)}</AlertDescription>
        </Alert>
      )}

      {/* Barre d'action collante : sur téléphone le bouton ne doit jamais se
          perdre en bas d'un long défilement. Voir `daydream-ui`. */}
      <div className="bg-background border-border pb-safe sticky bottom-0 mt-6 flex gap-2 border-t py-3">
        {step > 1 && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setStep((s) => s - 1)}
            disabled={isPending}
            className="h-12 text-base"
          >
            <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden />
            {t("common.back")}
          </Button>
        )}

        {step === 1 && (
          <Button
            type="button"
            onClick={goToPieces}
            disabled={isChecking}
            className="h-12 flex-1 text-base"
          >
            {isChecking && <Spinner />}
            {t("common.next")}
            <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden />
          </Button>
        )}

        {step === 2 && (
          <Button
            type="button"
            onClick={() => setStep(3)}
            disabled={lines.length === 0}
            className="h-12 flex-1 text-base"
          >
            {t("common.next")}
            <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden />
          </Button>
        )}

        {step === 3 && (
          <Button type="submit" disabled={isPending} className="h-12 flex-1 text-base">
            {isPending && <Spinner />}
            {t("orders.create")}
          </Button>
        )}
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

function Stepper({ step }: { step: number }) {
  const t = useTranslations();
  const labels = [t("orders.stepDates"), t("orders.stepPieces"), t("orders.stepAmounts")];

  return (
    <div className="mb-6">
      <p className="text-muted-foreground text-sm">
        {t("orders.stepOf", { current: step, total: TOTAL_STEPS })}
      </p>
      <h2 className="mt-1 text-xl">{labels[step - 1]}</h2>

      <div className="mt-3 flex gap-1.5" aria-hidden>
        {labels.map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full",
              i < step ? "bg-primary" : "bg-border",
            )}
          />
        ))}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  warning,
}: {
  label: string;
  value: string;
  strong?: boolean;
  warning?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "tabular",
          strong && "text-base font-medium",
          warning && "text-warning-foreground font-medium",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function LineCard({
  line,
  locale,
  onRemove,
  onPrice,
}: {
  line: DraftLine;
  locale: Locale;
  onRemove: () => void;
  onPrice: (value: string) => void;
}) {
  const t = useTranslations();

  return (
    <div className="border-border rounded-lg border p-3">
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
        <label className="text-muted-foreground text-sm" htmlFor={`price-${line.kind}`}>
          {t("orders.linePrice")}
        </label>
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          step={100}
          value={String(line.unitPrice)}
          onChange={(e) => onPrice(e.target.value)}
          className="tabular h-11 max-w-36 text-base"
        />
      </div>
    </div>
  );
}
