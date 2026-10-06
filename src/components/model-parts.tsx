"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { SelectBox } from "@/components/select-box";
import { PARTS, type Part } from "@/lib/stock-refs";
import { cn } from "@/lib/utils";

export type PartsValue = Record<Part, { on: boolean; price: string }>;

/** Valeur de départ : les parties du modèle, ou veste + pantalon pour un nouveau. */
export function initialParts(existing: { part: string; rent_price: number }[]): PartsValue {
  const value = {} as PartsValue;
  for (const part of PARTS) {
    const found = existing.find((p) => p.part === part);
    value[part] = existing.length
      ? { on: Boolean(found), price: found ? String(found.rent_price) : "" }
      : { on: part !== "gilet", price: "" };
  }
  return value;
}

/**
 * Les PARTIES d'un costume divisible : ce qui le compose (veste, pantalon,
 * gilet) et le prix de chacune louée SEULE. Le costume complet se loue au
 * prix du modèle.
 *
 * Chaque partie cochée part en champ caché `parts` = « veste:1500 » ;
 * `parts_field` dit à l'action que le champ était à l'écran (sinon elle ne
 * touche pas aux parties).
 */
export function ModelParts({
  value,
  onChange,
  disabled,
}: {
  value: PartsValue;
  onChange: (value: PartsValue) => void;
  disabled: boolean;
}) {
  const t = useTranslations();

  function set(part: Part, patch: Partial<PartsValue[Part]>) {
    onChange({ ...value, [part]: { ...value[part], ...patch } });
  }

  return (
    <div className="border-border divide-border divide-y rounded-lg border">
      <input type="hidden" name="parts_field" value="1" />
      {PARTS.filter((part) => value[part].on).map((part) => (
        <input key={part} type="hidden" name="parts" value={`${part}:${value[part].price}`} />
      ))}

      {PARTS.map((part) => {
        const label = t(`stock.parts.${part}`);
        return (
          <div key={part} className="flex min-h-14 items-center gap-2 pe-3 py-1.5">
            <SelectBox
              checked={value[part].on}
              onChange={() => !disabled && set(part, { on: !value[part].on })}
              label={label}
            />
            <span className="flex-1 text-base">{label}</span>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step={100}
              value={value[part].price}
              onChange={(e) => set(part, { price: e.target.value })}
              disabled={disabled || !value[part].on}
              placeholder={t("stock.parts.price")}
              aria-label={t("stock.parts.priceFor", { part: label })}
              className={cn("h-11 w-32 text-base", !value[part].on && "opacity-50")}
            />
          </div>
        );
      })}
    </div>
  );
}
