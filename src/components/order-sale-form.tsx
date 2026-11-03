"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertCircle,
  ChevronDown,
  List,
  Package,
  Plane,
  ScanLine,
  X,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { DatePicker } from "@/components/date-picker";
import { ListPicker, type PickerOption } from "@/components/list-picker";
import { SuggestInput, normalizeSearch, type SuggestOption } from "@/components/suggest-input";
import { HighlightText } from "@/components/highlight";
import { QrScanSheet, type ScanOutcome } from "@/components/qr-scan-sheet";
import { FlagToggle, MoneyStepper, Section } from "@/components/order-form-parts";
import { createOrder } from "@/lib/actions/orders";
import {
  resolveUnitPrice,
  spreadOutfitPrice,
  toPayload,
  type DraftLine,
} from "@/lib/order-draft";
import { EMPTY_DRAFT, EMPTY_SLOT, type QuickDraft } from "@/lib/quick-draft";
import { isNetworkError, queueOp } from "@/lib/offline/outbox";
import { fieldErrorsOf, orderSchema } from "@/lib/validation/orders";
import { todayIso } from "@/lib/rental-range";
import { formatDate, formatMoney } from "@/lib/format";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { CustomerSuggestion, PickerModel } from "@/lib/queries/orders";
import type { Locale } from "@/i18n/routing";

/**
 * La saisie d'une VENTE SEULE, au comptoir.
 *
 * Le client de passage achète une paire : rien à rendre, pas de caution, pas
 * de date d'événement, pas de tailleur. L'employé SCANNE l'étiquette QR de la
 * boîte (ou la choisit dans la liste), et enregistre. Nom et téléphone sont
 * facultatifs : sans nom, la commande est au nom de « Client de passage ».
 *
 * Une vente MÊLÉE à une location (costume loué + chaussures achetées) passe
 * toujours par la saisie rapide, avec « Vendre un article ».
 *
 * Côté base rien de neuf : `create_order` avec une seule date (retrait =
 * retour = jour de la vente). Les lignes deviennent des ventes d'après
 * l'usage du modèle, `has_rental` passe à faux, et « Remis au client » coché
 * termine la commande.
 */

type SaleDraft = {
  v: 1;
  unitIds: number[];
  customerName: string;
  customerPhone: string;
  /** Vide = aujourd'hui. Une autre date seulement pour une vente oubliée. */
  date: string;
  price: string;
  priceTouched: boolean;
  paid: string;
  /** Tant qu'il n'est pas tapé, le versement suit le prix : on paie au comptoir. */
  paidTouched: boolean;
  notes: string;
  handedOver: boolean;
};

const EMPTY_SALE: SaleDraft = {
  v: 1,
  unitIds: [],
  customerName: "",
  customerPhone: "",
  date: "",
  price: "",
  priceTouched: false,
  paid: "",
  paidTouched: false,
  notes: "",
  handedOver: true,
};

const STORAGE_KEY = "dd.saleOrder";
const MAX_SUGGESTIONS = 6;

function loadDraft(): SaleDraft {
  try {
    const d = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<SaleDraft> | null;
    if (!d || d.v !== 1 || !Array.isArray(d.unitIds)) return EMPTY_SALE;
    return { ...EMPTY_SALE, ...d };
  } catch {
    return EMPTY_SALE;
  }
}

function saveDraft(d: SaleDraft) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
  } catch {
    /* le brouillon vaut pour la session, faute de mieux. */
  }
}

/** Les références se comparent sans casse ni espaces : « gio-079-01 » = « GIO-079-01 ». */
const refKey = (ref: string) => ref.trim().toUpperCase();

type SaleUnit = {
  model: PickerModel;
  unit: PickerModel["units"][number];
  name: string;
  price: number;
};

export function OrderSaleForm({
  models,
  customers,
}: {
  models: PickerModel[];
  customers: CustomerSuggestion[];
}) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Le brouillon du téléphone : un appel au milieu de la vente ne fait rien
  // perdre. Lu après le montage, pour que le rendu serveur reste vide.
  const [draft, setDraft] = useState<SaleDraft>(EMPTY_SALE);
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setDraft(loadDraft());
    });
    return () => {
      cancelled = true;
    };
  }, []);
  function update(patch: Partial<SaleDraft>) {
    setDraft((d) => {
      const next = { ...d, ...patch };
      saveDraft(next);
      return next;
    });
  }

  const [scanOpen, setScanOpen] = useState(false);
  const [picker, setPicker] = useState<{ n: number; open: boolean } | null>(null);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [generalError, setGeneralError] = useState<{ key: string; values?: Record<string, string> } | null>(null);

  /** Toutes les pièces du catalogue par référence — pour dire POURQUOI un scan est refusé. */
  const { saleUnits, byRef } = useMemo(() => {
    const saleUnits = new Map<number, SaleUnit>();
    const byRef = new Map<string, { id: number; purpose: PickerModel["purpose"] }>();
    for (const model of models) {
      const name = (locale === "ar" ? model.name_ar : model.name_fr) || model.name_fr;
      for (const unit of model.units) {
        byRef.set(refKey(unit.ref_code), { id: unit.id, purpose: model.purpose });
        if (model.purpose === "vente") {
          saleUnits.set(unit.id, { model, unit, name, price: resolveUnitPrice(model, unit) });
        }
      }
    }
    return { saleUnits, byRef };
  }, [models, locale]);

  // Une paire du brouillon vendue entre-temps (ou retirée du stock) n'est
  // plus proposée : elle reste à l'écran, signalée, pour que l'employé la retire.
  const chosen = draft.unitIds.map((id) => ({ id, found: saleUnits.get(id) }));

  /** Pourquoi une paire ne peut pas être vendue maintenant ; `null` = elle peut. */
  function blockReason(id: number): string | null {
    const found = saleUnits.get(id);
    if (!found) return t("orders.sale.notForSale");
    if (found.unit.sold_order_id) return t("orders.sale.alreadySold");
    if (found.unit.status !== "disponible") {
      return t(found.unit.status === "nettoyage" ? "stock.cleaning" : "stock.repair");
    }
    return null;
  }

  const listTotal = chosen.reduce((s, c) => s + (c.found?.price ?? 0), 0);
  const price = draft.priceTouched ? draft.price : listTotal > 0 ? String(listTotal) : "";
  const total = Number(price) || 0;
  const paid = draft.paidTouched ? draft.paid : price;
  const balance = total - (Number(paid) || 0);
  const saleDate = draft.date || todayIso();

  const lines: DraftLine[] = useMemo(() => {
    const raw: DraftLine[] = draft.unitIds.map((id) => {
      const found = saleUnits.get(id);
      return {
        kind: "unit",
        unitId: id,
        unitPrice: 0,
        note: null,
        modelName: found?.name ?? "",
        refCode: found?.unit.ref_code ?? "",
        size: found?.unit.size ?? null,
      };
    });
    const weights = draft.unitIds.map((id) => saleUnits.get(id)?.price ?? 0);
    return spreadOutfitPrice(raw, total, weights);
  }, [draft.unitIds, saleUnits, total]);

  function addUnit(id: number) {
    setGeneralError(null);
    setDraft((d) => {
      if (d.unitIds.includes(id)) return d;
      const next = { ...d, unitIds: [...d.unitIds, id] };
      saveDraft(next);
      return next;
    });
  }

  function removeUnit(id: number) {
    update({ unitIds: draft.unitIds.filter((u) => u !== id) });
  }

  /** Un QR lu (ou une référence tapée) → la paire s'ajoute, ou on dit pourquoi pas. */
  function onScan(ref: string): ScanOutcome {
    const hit = byRef.get(refKey(ref));
    const shown = ref.trim();
    if (!hit) return { ok: false, message: t("orders.sale.unknownRef", { ref: shown }) };
    if (hit.purpose !== "vente") {
      return { ok: false, message: t("orders.sale.rentalRef", { ref: shown }) };
    }
    const found = saleUnits.get(hit.id)!;
    if (draft.unitIds.includes(hit.id)) {
      return { ok: false, message: t("orders.sale.alreadyInSale", { ref: found.unit.ref_code }) };
    }
    const reason = blockReason(hit.id);
    if (reason) return { ok: false, message: `${found.unit.ref_code} · ${reason}` };
    addUnit(hit.id);
    return {
      ok: true,
      message: t("orders.sale.added", {
        name: found.name,
        size: found.unit.size ?? "—",
        price: formatMoney(found.price, locale),
      }),
    };
  }

  const pickerOptions: PickerOption[] = [...saleUnits.entries()]
    .filter(([, { unit }]) => !unit.sold_order_id)
    .map(([id, { name, unit, price }]) => {
      const reason = blockReason(id);
      return {
        option: {
          key: String(id),
          label: name,
          search: `${name} ${unit.ref_code}`,
          secondary: (
            <>
              <bdi>{unit.ref_code}</bdi>
              {unit.size && ` · ${t("stock.size")} ${unit.size}`}
              {reason && <span className="text-warning-foreground"> · {reason}</span>}
            </>
          ),
          trailing: <span className="tabular">{formatMoney(price, locale)}</span>,
          disabled: Boolean(reason) || draft.unitIds.includes(id),
          featured: true,
        } satisfies PickerOption,
        name,
        size: unit.size ?? "",
      };
    })
    .sort(
      (a, b) =>
        Number(Boolean(a.option.disabled)) - Number(Boolean(b.option.disabled)) ||
        a.name.localeCompare(b.name) ||
        a.size.localeCompare(b.size, undefined, { numeric: true }),
    )
    .map((r) => r.option);

  const customerOptions: SuggestOption[] = (() => {
    const q = normalizeSearch(draft.customerName);
    if (q.length < 2) return [];
    return customers
      .filter((c) => normalizeSearch(c.name).includes(q))
      .slice(0, MAX_SUGGESTIONS)
      .map((c) => ({
        key: `${c.name}|${c.phone ?? ""}`,
        primary: <HighlightText text={c.name} q={draft.customerName} />,
        secondary: c.phone ? <bdi dir="ltr">{c.phone}</bdi> : undefined,
        onPick: () => update({ customerName: c.name, customerPhone: c.phone ?? "" }),
      }));
  })();

  // --- contrôle -------------------------------------------------------------
  const customerName = draft.customerName.trim() || t("orders.sale.walkIn");
  const blocked = draft.unitIds.filter((id) => blockReason(id));

  function collectIssues(): Record<string, string> {
    const parsed = orderSchema.safeParse({
      customer_name: customerName,
      customer_phone: draft.customerPhone,
      event_date: saleDate,
      pickup_date: saleDate,
      return_due_date: saleDate,
      discount: 0,
      amount_paid: paid,
      caution_amount: 0,
      notes: draft.notes,
      lines: toPayload(lines),
    });
    const issues = parsed.success ? {} : fieldErrorsOf(parsed.error);
    if (price.trim() && !(Number(price) >= 0)) issues.price = "errors.numberInvalid";
    if (!issues.lines && blocked.length) issues.lines = "orders.sale.removeBlocked";
    return issues;
  }
  const issues = attempted ? collectIssues() : {};

  function reset() {
    const fresh = { ...EMPTY_SALE, date: draft.date };
    saveDraft(fresh);
    setDraft(fresh);
    setAttempted(false);
    setGeneralError(null);
    setCustomerOpen(false);
  }

  // --- envoi ----------------------------------------------------------------
  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = collectIssues();
    if (Object.keys(found).length) {
      setAttempted(true);
      const firstId = found.customer_phone ? "s-phone" : found.lines ? "s-items" : "s-price";
      if (found.customer_phone) setCustomerOpen(true);
      requestAnimationFrame(() =>
        document.getElementById(firstId)?.scrollIntoView({ behavior: "smooth", block: "center" }),
      );
      return;
    }
    setGeneralError(null);

    const opId = crypto.randomUUID();
    const formData = new FormData();
    formData.set("locale", locale);
    // On reste sur l'écran de vente : le client suivant attend.
    formData.set("return_id", "1");
    formData.set("client_op_id", opId);
    formData.set("customer_name", customerName);
    formData.set("customer_phone", draft.customerPhone);
    formData.set("event_date", saleDate);
    formData.set("pickup_date", saleDate);
    formData.set("return_due_date", saleDate);
    formData.set("discount", "0");
    formData.set("amount_paid", paid);
    formData.set("caution_amount", "0");
    formData.set("notes", draft.notes);
    formData.set("picked_up", draft.handedOver ? "1" : "0");
    formData.set("returned", "0");
    formData.set("lines", JSON.stringify(toPayload(lines)));

    /**
     * Sans réseau : vente PROVISOIRE, confirmée par la base au retour du
     * réseau. Le brouillon gardé est celui de la saisie rapide (les paires en
     * pièces en plus) : c'est là que « Corriger » la rouvrira.
     */
    const queueProvisional = async () => {
      const fields: Record<string, string> = {};
      for (const [key, value] of formData.entries()) {
        if (typeof value === "string" && !["locale", "return_id", "client_op_id"].includes(key)) {
          fields[key] = value;
        }
      }
      const quick: QuickDraft = {
        ...EMPTY_DRAFT,
        customerName,
        customerPhone: draft.customerPhone,
        eventDate: saleDate,
        pickup: saleDate,
        returnDue: saleDate,
        datesTouched: true,
        slots: [
          ...EMPTY_DRAFT.slots,
          ...draft.unitIds.map((id) => {
            const f = saleUnits.get(id);
            return {
              ...EMPTY_SLOT,
              name: f?.name ?? "",
              size: f?.unit.size ?? "",
              unitId: id,
              ref: f?.unit.ref_code ?? null,
              stockPrice: f?.price ?? null,
            };
          }),
        ],
        pickedUp: draft.handedOver,
        price,
        priceTouched: draft.priceTouched,
        paid,
        notes: draft.notes,
      };
      await queueOp(
        {
          kind: "order",
          opId,
          fields,
          draft: quick,
          summary: {
            customerName,
            eventDate: saleDate,
            pickup: saleDate,
            returnDue: saleDate,
            unitIds: [...draft.unitIds],
          },
        },
        t("offline.orderTitle", { name: customerName, date: formatDate(saleDate, locale) }),
      );
      reset();
      toast(t("offline.queuedToast"));
      window.scrollTo({ top: 0, behavior: "smooth" });
    };

    startTransition(async () => {
      if (!navigator.onLine) {
        await queueProvisional();
        return;
      }
      let result: Awaited<ReturnType<typeof createOrder>>;
      try {
        result = await createOrder(formData);
      } catch (error) {
        if (isNetworkError(error)) {
          await queueProvisional();
          return;
        }
        setGeneralError({ key: "errors.generic" });
        return;
      }
      if (!result) return;
      if (result.ok) {
        const href = `/commandes/${result.id}`;
        reset();
        // Les paires vendues disparaissent de la liste et du scan.
        router.refresh();
        toast.success(t("orders.sale.savedToast", { amount: formatMoney(total, locale) }), {
          action: { label: t("orders.quick.view"), onClick: () => router.push(href) },
        });
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      if (result.error.startsWith("errors.unitUnavailable")) {
        // Vendue par un collègue entre-temps : on relit le catalogue.
        router.refresh();
      }
      setGeneralError({ key: result.error, values: result.values });
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <h1 className="font-heading mb-4 text-xl font-medium">{t("orders.sale.title")}</h1>

      {/* --- Articles : le geste du comptoir, en premier ------------------------ */}
      <Section id="s-items" title={t("orders.sale.items")} invalid={!!issues.lines}>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Button
            type="button"
            onClick={() => setScanOpen(true)}
            className="h-14 text-base"
          >
            <ScanLine className="size-5" aria-hidden />
            {t("orders.sale.scan")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setPicker({ n: Date.now(), open: true })}
            className="h-14 px-4 text-base"
          >
            <List className="size-5" aria-hidden />
            {t("orders.sale.pickFromList")}
          </Button>
        </div>

        {chosen.length === 0 ? (
          <p className="text-muted-foreground mt-4 text-sm">{t("orders.sale.empty")}</p>
        ) : (
          <ul className="divide-border border-border mt-4 divide-y rounded-lg border">
            {chosen.map(({ id, found }) => {
              const reason = blockReason(id);
              return (
                <li key={id} className="flex items-center gap-3 py-2 ps-3 pe-1">
                  <Package className="text-gold-strong size-5 shrink-0" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{found?.name ?? "—"}</p>
                    <p className="text-muted-foreground text-xs">
                      <bdi>{found?.unit.ref_code}</bdi>
                      {found?.unit.size && ` · ${t("stock.size")} ${found.unit.size}`}
                      {reason && (
                        <span className="text-destructive font-medium"> · {reason}</span>
                      )}
                    </p>
                  </div>
                  <span className="tabular text-sm">
                    {formatMoney(found?.price ?? 0, locale)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeUnit(id)}
                    className="text-muted-foreground hover:text-destructive size-11"
                  >
                    <X className="size-4" aria-hidden />
                    <span className="sr-only">{t("orders.removeLine")}</span>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        {issues.lines && (
          <p role="alert" className="text-destructive mt-3 text-sm">
            {t(issues.lines)}
          </p>
        )}
      </Section>

      {/* --- Paiement ------------------------------------------------------------ */}
      <Section id="s-payment" title={t("orders.quick.payment")}>
        <FieldGroup>
          <Field data-invalid={!!issues.price || undefined}>
            <FieldLabel htmlFor="s-price">{t("orders.quick.price")}</FieldLabel>
            <MoneyStepper
              id="s-price"
              value={price}
              onChange={(v) => update({ price: v, priceTouched: true })}
              invalid={!!issues.price}
            />
            {issues.price && <FieldError>{t(issues.price)}</FieldError>}
          </Field>

          <Field data-invalid={!!issues.amount_paid || undefined}>
            <FieldLabel htmlFor="s-paid">{t("orders.paid")}</FieldLabel>
            <MoneyStepper
              id="s-paid"
              value={paid}
              onChange={(v) => update({ paid: v, paidTouched: true })}
              invalid={!!issues.amount_paid}
            />
            {issues.amount_paid && <FieldError>{t(issues.amount_paid)}</FieldError>}
          </Field>

          <FlagToggle
            icon={<Plane className="size-4 rtl:-scale-x-100" aria-hidden />}
            label={t("orders.sale.handedOver")}
            checked={draft.handedOver}
            onChange={(v) => update({ handedOver: v })}
          />
        </FieldGroup>
      </Section>

      {/* --- Client et date : facultatifs, repliés --------------------------------- */}
      <Section id="s-more" title={t("orders.sale.more")}>
        <FieldGroup>
          <Disclosure
            open={customerOpen || Boolean(draft.customerName || draft.customerPhone)}
            onToggle={() => setCustomerOpen((v) => !v)}
            label={t("orders.sale.addCustomer")}
            summary={draft.customerName.trim() || t("orders.sale.walkIn")}
          >
            <Field>
              <FieldLabel htmlFor="s-name">{t("orders.customerName")}</FieldLabel>
              <SuggestInput
                id="s-name"
                value={draft.customerName}
                onValueChange={(v) => update({ customerName: v })}
                options={customerOptions}
                enterKeyHint="next"
                autoCapitalize="words"
                placeholder={t("orders.sale.walkIn")}
              />
            </Field>
            <Field data-invalid={!!issues.customer_phone || undefined}>
              <FieldLabel htmlFor="s-phone">{t("orders.quick.phoneOptional")}</FieldLabel>
              <Input
                id="s-phone"
                type="tel"
                inputMode="tel"
                dir="ltr"
                value={draft.customerPhone}
                onChange={(e) => update({ customerPhone: e.target.value })}
                autoComplete="off"
                className="h-12 text-base"
                aria-invalid={!!issues.customer_phone || undefined}
              />
              {issues.customer_phone && <FieldError>{t(issues.customer_phone)}</FieldError>}
            </Field>
          </Disclosure>

          <Disclosure
            open={dateOpen || Boolean(draft.date)}
            onToggle={() => setDateOpen((v) => !v)}
            label={t("orders.saleDate")}
            summary={formatDate(saleDate, locale)}
          >
            <DatePicker
              id="s-date"
              value={saleDate}
              onChange={(v) => update({ date: v === todayIso() ? "" : v })}
              placeholder={t("common.pickDate")}
            />
          </Disclosure>

          <Field>
            <FieldLabel htmlFor="s-notes">{t("orders.notesTitle")}</FieldLabel>
            <Textarea
              id="s-notes"
              rows={2}
              value={draft.notes}
              onChange={(e) => update({ notes: e.target.value })}
              className="text-base"
            />
          </Field>
        </FieldGroup>
      </Section>

      {generalError && (
        <Alert variant="destructive" className="mt-6">
          <AlertCircle />
          <AlertDescription>{t(generalError.key, generalError.values)}</AlertDescription>
        </Alert>
      )}

      <div className="bg-background border-border bottom-above-nav sticky z-30 mt-6 border-t py-3 md:bottom-0">
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
        <Button type="submit" disabled={isPending} className="h-12 w-full text-base">
          {isPending && <Spinner />}
          {t("orders.sale.save")}
        </Button>
      </div>

      <QrScanSheet open={scanOpen} onOpenChange={setScanOpen} onScan={onScan} />

      {picker && (
        <ListPicker
          key={picker.n}
          open={picker.open}
          onOpenChange={(open) => setPicker({ ...picker, open })}
          title={t("orders.sale.pickFromList")}
          options={pickerOptions}
          selected={[]}
          onDone={(keys) => {
            for (const key of keys) addUnit(Number(key));
            setPicker({ ...picker, open: false });
          }}
          allowNew={false}
          instant
          emptyText={t("orders.quick.noSaleStock")}
        />
      )}
    </form>
  );
}

/** Une ligne repliée « Client · Client de passage ▾ » qui s'ouvre au toucher. */
function Disclosure({
  open,
  onToggle,
  label,
  summary,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-border rounded-lg border">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-12 w-full items-center gap-2 px-3 text-start text-sm"
      >
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground min-w-0 flex-1 truncate text-end">{summary}</span>
        <ChevronDown
          className={cn("text-muted-foreground size-4 shrink-0 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open && <div className="space-y-4 px-3 pb-3">{children}</div>}
    </div>
  );
}
