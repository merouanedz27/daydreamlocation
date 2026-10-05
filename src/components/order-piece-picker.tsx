"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { CalendarClock, Check, Search } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { HighlightText } from "@/components/highlight";
import { normalizeSearch } from "@/lib/search";
import { photoUrl } from "@/lib/storage";
import { formatDate, formatMoney } from "@/lib/format";
import { resolveUnitPrice } from "@/lib/order-draft";
import { cn } from "@/lib/utils";
import type { PickerModel, PickerUnit, Unavailability } from "@/lib/queries/orders";
import type { Locale } from "@/i18n/routing";

export type PickedUnit = {
  unitId: number;
  unitPrice: number;
  modelName: string;
  refCode: string;
  size: string | null;
};

export function OrderPiecePicker({
  open,
  onOpenChange,
  models,
  unavailable,
  alreadyPicked,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  models: PickerModel[];
  unavailable: Map<number, Unavailability>;
  alreadyPicked: Set<number>;
  onPick: (unit: PickedUnit) => void;
}) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const [term, setTerm] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  const categories = useMemo(() => {
    const seen = new Map<string, string>();
    for (const m of models) {
      if (!m.category_slug) continue;
      const label =
        (locale === "ar" ? m.category_ar : m.category_fr) ?? m.category_slug;
      if (!seen.has(m.category_slug)) seen.set(m.category_slug, label);
    }
    return [...seen.entries()];
  }, [models, locale]);

  // Saisie instantanée, liste un temps derrière : voir `ListPicker`.
  const deferredTerm = useDeferredValue(term);

  const filtered = useMemo(() => {
    const q = normalizeSearch(deferredTerm);
    const has = (value: string | null | undefined) => Boolean(value) && normalizeSearch(value!).includes(q);
    return models.filter((m) => {
      if (category && m.category_slug !== category) return false;
      if (!q) return true;
      // On cherche sur ce que l'équipe a sous les yeux : la référence
      // fournisseur d'abord, puis le nom, puis la taille.
      return (
        has(m.ref_code) ||
        has(m.name_fr) ||
        has(m.name_ar) ||
        m.units.some((u) => has(u.ref_code) || has(u.size))
      );
    });
  }, [models, deferredTerm, category]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90svh]">
        <DrawerHeader className="text-start">
          <DrawerTitle>{t("orders.addPiece")}</DrawerTitle>
          <DrawerDescription>{t("orders.noLinesHint")}</DrawerDescription>
        </DrawerHeader>

        <div className="space-y-3 px-4">
          <div className="relative">
            <Search
              className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
              aria-hidden
            />
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder={t("orders.searchPiece")}
              className="h-12 ps-10 text-base"
              autoComplete="off"
            />
          </div>

          {categories.length > 0 && (
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 max-md:scrollbar-none">
              <CategoryChip
                label={t("stock.allCategories")}
                active={category === null}
                onClick={() => setCategory(null)}
              />
              {categories.map(([slug, label]) => (
                <CategoryChip
                  key={slug}
                  label={label}
                  active={category === slug}
                  onClick={() => setCategory(slug)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="mt-3 flex-1 overflow-y-auto px-4 pb-6">
          {filtered.length === 0 ? (
            <p className="text-muted-foreground py-12 text-center text-sm">
              {t("stock.noMatch")}
            </p>
          ) : (
            <ul className="space-y-4">
              {filtered.map((model) => (
                <li key={model.id}>
                  <ModelBlock
                    model={model}
                    locale={locale}
                    unavailable={unavailable}
                    alreadyPicked={alreadyPicked}
                    onPick={onPick}
                    q={deferredTerm}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "min-h-9 shrink-0 rounded-full border px-3 text-sm transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground font-medium"
          : "border-border text-muted-foreground hover:bg-muted",
      )}
    >
      {label}
    </button>
  );
}

function ModelBlock({
  model,
  locale,
  unavailable,
  alreadyPicked,
  onPick,
  q,
}: {
  model: PickerModel;
  locale: Locale;
  unavailable: Map<number, Unavailability>;
  alreadyPicked: Set<number>;
  onPick: (unit: PickedUnit) => void;
  /** Le terme cherché, surligné dans le nom, la référence et la taille. */
  q: string;
}) {
  const t = useTranslations();
  const name = (locale === "ar" ? model.name_ar : model.name_fr) || model.name_fr;

  return (
    <div className="border-border rounded-lg border p-3">
      <div className="flex items-center gap-3">
        {model.photo_path ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={photoUrl(model.photo_path)}
            alt=""
            className="bg-muted size-12 shrink-0 rounded object-cover"
            loading="lazy"
          />
        ) : (
          <div className="bg-muted size-12 shrink-0 rounded" aria-hidden />
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">
            <HighlightText text={name} q={q} />
          </p>
          <p className="text-muted-foreground truncate text-sm">
            <bdi>
              <HighlightText text={model.ref_code} q={q} />
            </bdi>
            {" · "}
            <span className="tabular">{formatMoney(model.base_price, locale)}</span>
          </p>
        </div>
      </div>

      {model.units.length === 0 ? (
        <p className="text-muted-foreground mt-3 text-sm">
          {t("orders.noPieceAvailable")}
        </p>
      ) : (
        <ul className="mt-3 space-y-1">
          {model.units.map((unit) => (
            <li key={unit.id}>
              <UnitRow
                model={model}
                unit={unit}
                locale={locale}
                blocked={unavailable.get(unit.id)}
                picked={alreadyPicked.has(unit.id)}
                onPick={onPick}
                q={q}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Une pièce indisponible reste AFFICHÉE, grisée, avec sa date de libération.
 * La cacher priverait l'employé de l'information qui lui permet de proposer une
 * autre date au client au lieu de raccrocher.
 */
function UnitRow({
  model,
  unit,
  locale,
  blocked,
  picked,
  onPick,
  q,
}: {
  model: PickerModel;
  unit: PickerUnit;
  locale: Locale;
  blocked?: Unavailability;
  picked: boolean;
  onPick: (unit: PickedUnit) => void;
  q: string;
}) {
  const t = useTranslations();
  const price = resolveUnitPrice(model, unit);

  // Deux causes d'indisponibilité, à ne surtout pas confondre : l'état matériel
  // de la pièce (au nettoyage, en réparation) et une commande qui la bloque sur
  // ces dates. Le message doit dire laquelle des deux.
  const materialIssue = unit.status !== "disponible";
  const disabled = picked || materialIssue || Boolean(blocked);

  let reason: string | null = null;
  if (!picked && materialIssue) {
    reason = t(unit.status === "nettoyage" ? "stock.cleaning" : "stock.repair");
  } else if (!picked && blocked) {
    reason = blocked.freeFrom
      ? t("orders.freeFrom", { date: formatDate(blocked.freeFrom, locale) })
      : t("orders.takenOnDates");
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() =>
        onPick({
          unitId: unit.id,
          unitPrice: price,
          modelName:
            (locale === "ar" ? model.name_ar : model.name_fr) || model.name_fr,
          refCode: unit.ref_code,
          size: unit.size,
        })
      }
      className={cn(
        "flex min-h-12 w-full items-center gap-3 rounded-md px-3 text-start transition-colors",
        disabled ? "cursor-not-allowed opacity-55" : "hover:bg-accent active:bg-accent",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          <bdi>
            <HighlightText text={unit.ref_code} q={q} />
          </bdi>
          {unit.size && (
            <span className="text-muted-foreground font-normal">
              {" · "}
              {t("stock.size")} <HighlightText text={unit.size} q={q} />
            </span>
          )}
        </span>

        {reason && (
          <span className="text-warning-foreground mt-0.5 flex items-center gap-1 text-xs">
            <CalendarClock className="size-3 shrink-0" aria-hidden />
            {reason}
          </span>
        )}
      </span>

      {picked ? (
        <Badge className="bg-success-soft text-success-foreground shrink-0 border-transparent">
          <Check className="size-3" aria-hidden />
        </Badge>
      ) : (
        <span className="tabular shrink-0 text-sm">{formatMoney(price, locale)}</span>
      )}
    </button>
  );
}
