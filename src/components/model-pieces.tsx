"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sizeSeries, sortSizes } from "@/lib/sizes";
import { nextUnitRefs } from "@/lib/stock-refs";
import { MAX_PIECES } from "@/lib/validation/stock";
import { cn } from "@/lib/utils";

/**
 * Les pièces d'un modèle, saisies SUR LA PAGE DE CRÉATION : on touche une
 * taille reçue, puis − / + pour le nombre (« 50 × 4 »). Chaque ligne part en
 * champ caché `pieces` = « 50:4 » ; la Server Action crée les pièces avec le
 * modèle et leur dérive les références.
 */
export function ModelPieces({
  categorySlug,
  refCode,
  disabled,
}: {
  categorySlug: string | null;
  refCode: string;
  disabled: boolean;
}) {
  const t = useTranslations();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [other, setOther] = useState("");

  const series = sizeSeries(categorySlug);
  const chosen = sortSizes(Object.keys(counts));
  const chips = sortSizes([...series, ...chosen]);
  const total = chosen.reduce((n, size) => n + counts[size], 0);
  const refs = nextUnitRefs(refCode.trim() || "REF", [], Math.max(total, 1));

  function change(size: string, delta: number) {
    setCounts((current) => {
      const next = { ...current };
      const value = Math.min((next[size] ?? 0) + delta, 50);
      if (value <= 0) delete next[size];
      else if (total + (value - (current[size] ?? 0)) <= MAX_PIECES) next[size] = value;
      return next;
    });
  }

  function addOther() {
    const size = other.trim().slice(0, 20);
    if (size && !counts[size]) change(size, 1);
    setOther("");
  }

  return (
    <div className="space-y-3">
      {chosen.map((size) => (
        <input key={size} type="hidden" name="pieces" value={`${size}:${counts[size]}`} />
      ))}

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("stock.piecesSection")}>
          {chips.map((size) => {
            const on = Boolean(counts[size]);
            return (
              <button
                key={size}
                type="button"
                aria-pressed={on}
                disabled={disabled}
                onClick={() => (on ? change(size, -counts[size]) : change(size, 1))}
                className={cn(
                  "press tabular flex h-11 min-w-12 items-center justify-center rounded-full border px-3 text-base font-medium",
                  on
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border hover:bg-muted",
                )}
              >
                <bdi>{size}</bdi>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex gap-2">
        <Input
          value={other}
          onChange={(e) => setOther(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addOther();
            }
          }}
          disabled={disabled}
          placeholder={t("stock.otherSize")}
          aria-label={t("stock.otherSize")}
          className="h-12 flex-1 text-base"
        />
        <Button
          type="button"
          variant="secondary"
          onClick={addOther}
          disabled={disabled || !other.trim()}
          className="h-12"
        >
          <Plus className="size-4" aria-hidden />
          {t("stock.addSize")}
        </Button>
      </div>

      {chosen.length > 0 && (
        <ul className="border-border divide-border divide-y rounded-lg border">
          {chosen.map((size) => (
            <li key={size} className="flex items-center gap-3 px-3 py-1">
              <span className="text-muted-foreground text-sm">{t("stock.size")}</span>
              <span className="tabular flex-1 text-base font-medium">
                <bdi>{size}</bdi>
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-11"
                disabled={disabled}
                onClick={() => change(size, -1)}
                aria-label={t("stock.decreaseFor", { size })}
              >
                <Minus className="size-4" aria-hidden />
              </Button>
              <span
                className="tabular w-8 text-center text-lg font-medium"
                aria-live="polite"
                aria-label={t("stock.quantityFor", { size, count: String(counts[size]) })}
              >
                {counts[size]}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-11"
                disabled={disabled}
                onClick={() => change(size, 1)}
                aria-label={t("stock.increaseFor", { size })}
              >
                <Plus className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-muted-foreground text-sm">
        {total
          ? t("stock.piecesPreview", {
              count: total,
              n: String(total),
              first: refs[0],
              last: refs[refs.length - 1],
            })
          : t("stock.piecesHint")}
      </p>
    </div>
  );
}
