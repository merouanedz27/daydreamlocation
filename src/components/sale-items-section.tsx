"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { List, Package, ScanLine, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ListPicker, type PickerOption } from "@/components/list-picker";
import { QrScanSheet, type ScanOutcome } from "@/components/qr-scan-sheet";
import { resolveUnitPrice } from "@/lib/order-draft";
import { formatMoney } from "@/lib/format";
import type { PickerModel } from "@/lib/queries/orders";
import type { Locale } from "@/i18n/routing";

/**
 * Le choix des articles à VENDRE — scanner l'étiquette QR de la boîte, ou
 * piocher dans la liste. Partagé par la vente au comptoir (`OrderSaleForm`)
 * et le bloc « Vente » de la saisie d'une commande (`OrderQuickForm`) : une
 * location et ses achats sur UNE commande, UN ticket (demande du client).
 *
 * Seul le stock de VENTE est proposé : une pièce de location scannée ici est
 * refusée, avec la raison.
 */

/** Les références se comparent sans casse ni espaces : « gio-079-01 » = « GIO-079-01 ». */
const refKey = (ref: string) => ref.trim().toUpperCase();

export type SaleUnit = {
  model: PickerModel;
  unit: PickerModel["units"][number];
  name: string;
  price: number;
};

export type SaleCatalog = {
  saleUnits: Map<number, SaleUnit>;
  byRef: Map<string, { id: number; purpose: PickerModel["purpose"] }>;
  /** Pourquoi un article ne peut pas être vendu maintenant ; `null` = il peut. */
  blockReason: (id: number) => string | null;
  /** Vendu par une AUTRE commande : il a quitté la boutique. */
  soldElsewhere: (id: number) => boolean;
};

export function useSaleCatalog(
  models: PickerModel[],
  {
    ownOrderId,
    holds,
  }: {
    /** En modification : les articles de CETTE commande ne sont pas « déjà vendus ». */
    ownOrderId?: number;
    /** Articles tenus par un client en attente sur ce téléphone. */
    holds?: Map<number, string>;
  } = {},
): SaleCatalog {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();

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

  const soldElsewhere = (id: number) => {
    const sold = saleUnits.get(id)?.unit.sold_order_id;
    return Boolean(sold && sold !== ownOrderId);
  };

  function blockReason(id: number): string | null {
    const found = saleUnits.get(id);
    if (!found) return t("orders.sale.notForSale");
    // Déjà dans la commande qu'on modifie : rien à revérifier.
    if (ownOrderId && found.unit.sold_order_id === ownOrderId) return null;
    if (found.unit.sold_order_id) return t("orders.sale.alreadySold");
    if (found.unit.status !== "disponible") {
      return t(found.unit.status === "nettoyage" ? "stock.cleaning" : "stock.repair");
    }
    const heldBy = holds?.get(id);
    if (heldBy !== undefined) return t("orders.parked.heldBy", { name: heldBy });
    return null;
  }

  return { saleUnits, byRef, blockReason, soldElsewhere };
}

/**
 * Les boutons Scanner / Liste, puis les articles choisis. Contrôlé : la
 * liste des articles (`unitIds`) vit dans le brouillon du formulaire parent.
 */
export function SaleItemsSection({
  catalog,
  unitIds,
  fallback,
  onAdd,
  onRemove,
  error,
  scanId,
}: {
  catalog: SaleCatalog;
  unitIds: number[];
  /** Nom / référence / taille gardés dans le brouillon, pour un article sorti du catalogue. */
  fallback?: (id: number) => { name: string; ref: string | null; size: string | null } | null;
  onAdd: (id: number) => void;
  onRemove: (id: number) => void;
  error?: string | null;
  /** Identifiant du bouton Scanner — la cible d'une erreur à l'envoi. */
  scanId?: string;
}) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const { saleUnits, byRef, blockReason, soldElsewhere } = catalog;
  const [scanOpen, setScanOpen] = useState(false);
  const [picker, setPicker] = useState<{ n: number; open: boolean } | null>(null);

  /** Un QR lu (ou une référence tapée) → l'article s'ajoute, ou on dit pourquoi pas. */
  function onScan(ref: string): ScanOutcome {
    const hit = byRef.get(refKey(ref));
    const shown = ref.trim();
    if (!hit) return { ok: false, message: t("orders.sale.unknownRef", { ref: shown }) };
    if (hit.purpose !== "vente") {
      return { ok: false, message: t("orders.sale.rentalRef", { ref: shown }) };
    }
    const found = saleUnits.get(hit.id)!;
    if (unitIds.includes(hit.id)) {
      return { ok: false, message: t("orders.sale.alreadyInSale", { ref: found.unit.ref_code }) };
    }
    const reason = blockReason(hit.id);
    if (reason) return { ok: false, message: `${found.unit.ref_code} · ${reason}` };
    onAdd(hit.id);
    return {
      ok: true,
      message: t("orders.sale.added", {
        name: found.name,
        size: found.unit.size ?? "—",
        price: formatMoney(found.price, locale),
      }),
    };
  }

  const pickerOptions: PickerOption[] = picker
    ? [...saleUnits.entries()]
        .filter(([id]) => !soldElsewhere(id))
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
              disabled: Boolean(reason) || unitIds.includes(id),
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
        .map((r) => r.option)
    : [];

  return (
    <>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Button
          id={scanId}
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

      {unitIds.length === 0 ? (
        <p className="text-muted-foreground mt-4 text-sm">{t("orders.sale.empty")}</p>
      ) : (
        <ul className="divide-border border-border bg-background mt-4 divide-y rounded-lg border">
          {unitIds.map((id) => {
            const found = saleUnits.get(id);
            const kept = found ? null : fallback?.(id);
            const name = found?.name ?? kept?.name ?? "—";
            const ref = found?.unit.ref_code ?? kept?.ref ?? null;
            const size = found?.unit.size ?? kept?.size ?? null;
            const reason = blockReason(id);
            return (
              <li key={id} className="flex items-center gap-3 py-2 ps-3 pe-1">
                <Package className="text-gold-strong size-5 shrink-0" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{name}</p>
                  <p className="text-muted-foreground text-xs">
                    {ref && <bdi>{ref}</bdi>}
                    {size && ` · ${t("stock.size")} ${size}`}
                    {reason && <span className="text-destructive font-medium"> · {reason}</span>}
                  </p>
                </div>
                {found && (
                  <span className="tabular text-sm">{formatMoney(found.price, locale)}</span>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onRemove(id)}
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

      {error && (
        <p role="alert" className="text-destructive mt-3 text-sm">
          {error}
        </p>
      )}

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
            for (const key of keys) onAdd(Number(key));
            setPicker({ ...picker, open: false });
          }}
          allowNew={false}
          instant
          emptyText={t("orders.quick.noSaleStock")}
        />
      )}
    </>
  );
}
