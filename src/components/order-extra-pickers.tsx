"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { Layers, Store } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PickerEnsemble } from "@/lib/queries/orders";
import type { Locale } from "@/i18n/routing";

/**
 * Choix d'un ensemble — « Costume n°12 ».
 *
 * Un ensemble NE SE RÉSERVE JAMAIS : le choisir déplie ses pièces en lignes
 * individuelles, que l'employé peut ensuite retirer ou remplacer une par une.
 * C'est exactement le geste que le tableur rendait impossible.
 */
export function OrderEnsemblePicker({
  open,
  onOpenChange,
  ensembles,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ensembles: PickerEnsemble[];
  onPick: (ensemble: PickerEnsemble) => void;
}) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85svh]">
        <DrawerHeader className="text-start">
          <DrawerTitle>{t("orders.chooseEnsemble")}</DrawerTitle>
          <DrawerDescription>{t("orders.ensembleHint")}</DrawerDescription>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-6">
          {ensembles.length === 0 ? (
            <p className="text-muted-foreground py-12 text-center text-sm">
              {t("common.empty")}
            </p>
          ) : (
            <ul className="space-y-2">
              {ensembles.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => onPick(e)}
                    className={cn(
                      "border-border hover:border-gold-strong hover:bg-accent",
                      "flex min-h-14 w-full items-center gap-3 rounded-lg border p-3 text-start transition-colors",
                    )}
                  >
                    <Layers className="text-gold-strong size-5 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{e.name}</span>
                      <span className="text-muted-foreground text-sm">
                        {t("orders.ensemblePieces", { count: e.unit_ids.length })}
                      </span>
                    </span>
                    {e.package_price !== null && (
                      <span className="tabular shrink-0 text-sm font-medium">
                        {formatMoney(e.package_price, locale)}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export type ExternalDraft = {
  source: string;
  label: string;
  cost: string;
  unitPrice: string;
};

/**
 * Pièce sous-louée chez un confrère — la colonne « FETHI LOC » du tableur.
 *
 * Elle n'entre pas dans le stock : elle ne lui appartient pas et il ne maîtrise
 * pas son planning. La ligne n'a donc pas de `unit_id` et ne bloque aucune date.
 */
export function OrderExternalPicker({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (draft: ExternalDraft) => void;
}) {
  const t = useTranslations();
  const [draft, setDraft] = useState<ExternalDraft>({
    source: "",
    label: "",
    cost: "",
    unitPrice: "",
  });

  const set = (k: keyof ExternalDraft) => (v: string) =>
    setDraft((d) => ({ ...d, [k]: v }));

  function submit() {
    if (!draft.label.trim()) return;
    onAdd(draft);
    setDraft({ source: "", label: "", cost: "", unitPrice: "" });
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90svh]">
        <DrawerHeader className="text-start">
          <DrawerTitle className="flex items-center gap-2">
            <Store className="size-5 shrink-0" aria-hidden />
            {t("orders.addExternal")}
          </DrawerTitle>
          <DrawerDescription>{t("orders.externalHint")}</DrawerDescription>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto px-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="ext_label">{t("orders.externalLabel")}</FieldLabel>
              <Input
                id="ext_label"
                value={draft.label}
                onChange={(e) => set("label")(e.target.value)}
                placeholder="Veste taille 60"
                className="h-12 text-base"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="ext_source">{t("orders.externalSource")}</FieldLabel>
              <Input
                id="ext_source"
                value={draft.source}
                onChange={(e) => set("source")(e.target.value)}
                placeholder="Fethi"
                className="h-12 text-base"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="ext_price">{t("orders.linePrice")}</FieldLabel>
              <Input
                id="ext_price"
                type="number"
                inputMode="numeric"
                min={0}
                step={100}
                value={draft.unitPrice}
                onChange={(e) => set("unitPrice")(e.target.value)}
                className="h-12 text-base"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="ext_cost">{t("orders.externalCost")}</FieldLabel>
              <Input
                id="ext_cost"
                type="number"
                inputMode="numeric"
                min={0}
                step={100}
                value={draft.cost}
                onChange={(e) => set("cost")(e.target.value)}
                className="h-12 text-base"
              />
              <FieldDescription>{t("orders.externalCostHint")}</FieldDescription>
            </Field>
          </FieldGroup>
        </div>

        <DrawerFooter>
          <Button
            type="button"
            onClick={submit}
            disabled={!draft.label.trim()}
            className="h-12 w-full text-base"
          >
            {t("orders.addExternal")}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
