"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { HighlightText } from "@/components/highlight";
import { normalizeSearch } from "@/lib/search";
import { cn } from "@/lib/utils";

export type PickerOption = {
  key: string;
  label: string;
  /** Texte cherché à la place du libellé — la référence, sans l'afficher. */
  search?: string;
  secondary?: React.ReactNode;
  trailing?: React.ReactNode;
  disabled?: boolean;
  /** Montrée sans rien taper : les choix habituels de CETTE case. */
  featured?: boolean;
};

/** Préfixe des valeurs tapées dans la recherche, absentes de la liste. */
export const NEW_KEY = "new:";

/**
 * Garde-fou seulement : l'équipe fait DÉFILER la liste plutôt que de chercher,
 * aucune pièce ne doit être cachée derrière la recherche.
 */
const MAX_ROWS = 600;

/**
 * La liste à cocher de son AppSheet — « COSTUMES 🤵 » : une recherche en haut,
 * des cases à cocher, « Done » en bas.
 *
 * Ce qu'elle fait de plus :
 * - sans rien taper, elle ne montre que les choix HABITUELS de la case (les
 *   chemises dans « Chemise ») ; en tapant, elle cherche partout ;
 * - un vêtement absent de la liste s'ajoute depuis la recherche
 *   (« Ajouter « Smoking bleu nuit » ») — AppSheet obligeait à modifier la
 *   feuille ;
 * - les pièces du STOCK y figurent, grisées quand elles sont prises.
 *
 * L'état (recherche, cases cochées) naît à l'ouverture : le parent remonte le
 * composant à chaque ouverture (`key`), on repart toujours de la case.
 */
export function ListPicker({
  open,
  onOpenChange,
  title,
  options,
  selected,
  onDone,
  allowNew = true,
  instant = false,
  emptyText,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  options: PickerOption[];
  selected: string[];
  onDone: (keys: string[]) => void;
  /** Faux : rien ne s'ajoute depuis la recherche — le STOCK seulement. */
  allowNew?: boolean;
  /**
   * Un seul choix, en UN toucher : la ligne touchée est choisie et la liste
   * se referme — pas de « Valider ». Plusieurs choix d'un coup restent pour
   * « + Autre pièce ».
   */
  instant?: boolean;
  /** Le message d'une liste vide, à la place de l'indice général. */
  emptyText?: string;
}) {
  const t = useTranslations();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>(selected);

  // La saisie reste instantanée ; la liste (filtre + surlignage) suit juste
  // après, sans bloquer le clavier sur un téléphone modeste.
  const deferredQuery = useDeferredValue(query);
  const q = normalizeSearch(deferredQuery);

  const visible = useMemo(() => {
    if (!q) return options.filter((o) => o.featured || picked.includes(o.key));
    const hits = options
      .map((o, i) => ({ o, i, n: normalizeSearch(o.search ?? o.label) }))
      .filter(({ n }) => n.includes(q));
    // Ce qui COMMENCE par la recherche d'abord, puis les choix habituels,
    // puis l'ordre alphabétique d'origine.
    hits.sort(
      (a, b) =>
        Number(b.n.startsWith(q)) - Number(a.n.startsWith(q)) ||
        Number(Boolean(b.o.featured)) - Number(Boolean(a.o.featured)) ||
        a.i - b.i,
    );
    return hits.map(({ o }) => o);
  }, [options, q, picked]);

  const exact = q && options.some((o) => normalizeSearch(o.label) === q);
  const typed = query.trim();
  // Les valeurs nouvelles déjà cochées restent visibles, recherche effacée.
  const customs = picked.filter((k) => k.startsWith(NEW_KEY));

  function toggle(key: string) {
    if (instant) {
      onDone([key]);
      return;
    }
    setPicked((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <DrawerContent className="h-[88svh] max-h-[88svh]">
        <DrawerHeader className="pb-2 text-start">
          <DrawerTitle className="text-lg">{title}</DrawerTitle>
          <DrawerDescription className="sr-only">{t("picker.hint")}</DrawerDescription>
        </DrawerHeader>

        <div className="relative px-4 pb-2">
          <Search
            className="text-muted-foreground pointer-events-none absolute start-7 top-[calc(50%-0.25rem)] size-4 -translate-y-1/2"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("picker.search")}
            aria-label={t("picker.search")}
            autoComplete="off"
            enterKeyHint="search"
            className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-12 w-full rounded-md border ps-10 pe-11 text-base outline-none focus-visible:ring-[3px] [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={t("search.clear")}
              className="text-muted-foreground hover:text-foreground absolute end-5 top-[calc(50%-0.25rem)] flex size-10 -translate-y-1/2 items-center justify-center"
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>

        <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2" role="listbox" aria-multiselectable>
          {allowNew && typed && !exact && (
            <PickerRow
              checked={picked.includes(NEW_KEY + typed)}
              onToggle={() => toggle(NEW_KEY + typed)}
              label={
                <span className="flex items-center gap-1.5">
                  <Plus className="text-gold-strong size-4 shrink-0" aria-hidden />
                  {t("picker.addNew", { label: typed })}
                </span>
              }
            />
          )}
          {!q &&
            customs.map((key) => (
              <PickerRow
                key={key}
                checked
                onToggle={() => toggle(key)}
                label={key.slice(NEW_KEY.length)}
              />
            ))}
          {visible.slice(0, MAX_ROWS).map((option) => (
            <PickerRow
              key={option.key}
              checked={picked.includes(option.key)}
              disabled={option.disabled && !picked.includes(option.key)}
              onToggle={() => toggle(option.key)}
              label={<HighlightText text={option.label} q={deferredQuery} />}
              secondary={option.secondary}
              trailing={option.trailing}
            />
          ))}
          {!visible.length && (!typed || !allowNew) && (
            <li className="text-muted-foreground px-3 py-8 text-center text-sm">
              {emptyText ?? t("picker.emptyHint")}
            </li>
          )}
        </ul>

        {!instant && (
          <DrawerFooter className="border-border grid grid-cols-2 gap-2 border-t pt-3">
            <Button
              type="button"
              variant="ghost"
              className="h-12 text-base"
              onClick={() => setPicked([])}
              disabled={!picked.length}
            >
              {t("picker.clear")}
            </Button>
            <Button type="button" className="h-12 text-base" onClick={() => onDone(picked)}>
              {picked.length > 1
                ? t("picker.doneCount", { count: picked.length })
                : t("picker.done")}
            </Button>
          </DrawerFooter>
        )}
      </DrawerContent>
    </Drawer>
  );
}

function PickerRow({
  checked,
  disabled,
  onToggle,
  label,
  secondary,
  trailing,
}: {
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
  label: React.ReactNode;
  secondary?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <li role="option" aria-selected={checked} aria-disabled={disabled || undefined}>
      <button
        type="button"
        disabled={disabled}
        onClick={onToggle}
        className={cn(
          "flex min-h-12 w-full items-center gap-3 rounded-md px-3 py-1.5 text-start",
          disabled ? "cursor-not-allowed opacity-55" : "hover:bg-muted active:bg-muted",
        )}
      >
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-sm border",
            checked ? "bg-primary text-primary-foreground border-transparent" : "border-foreground/40",
          )}
          aria-hidden
        >
          {checked && <Check className="size-3.5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base">{label}</span>
          {secondary && <span className="text-muted-foreground block truncate text-xs">{secondary}</span>}
        </span>
        {trailing && <span className="shrink-0 text-sm">{trailing}</span>}
      </button>
    </li>
  );
}

/**
 * Le choix d'une TAILLE — la liste 44…66 de son AppSheet, en grille : toutes
 * les tailles d'un coup d'œil, et un seul toucher qui choisit ET referme (la
 * liste à cocher d'AppSheet en demandait deux). Une taille hors grille se
 * tape dans « Autre ».
 */
export function SizePicker({
  open,
  onOpenChange,
  title,
  sizes,
  value,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  sizes: string[];
  value: string;
  onPick: (value: string) => void;
}) {
  const t = useTranslations();
  const [other, setOther] = useState(sizes.includes(value) ? "" : value);

  return (
    <Drawer open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <DrawerContent>
        <DrawerHeader className="pb-2 text-start">
          <DrawerTitle className="text-lg">{title}</DrawerTitle>
          <DrawerDescription className="sr-only">{t("picker.sizeHint")}</DrawerDescription>
        </DrawerHeader>

        <div className="grid grid-cols-4 gap-2 px-4" role="radiogroup" aria-label={title}>
          {sizes.map((size) => (
            <button
              key={size}
              type="button"
              role="radio"
              aria-checked={value === size}
              onClick={() => onPick(size)}
              className={cn(
                "tabular h-12 rounded-lg border text-base transition-colors",
                value === size
                  ? "border-primary bg-primary text-primary-foreground font-semibold"
                  : "border-border bg-card hover:border-gold-strong",
              )}
            >
              {size}
            </button>
          ))}
        </div>

        <form
          className="mt-3 flex gap-2 px-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (other.trim()) onPick(other.trim());
          }}
        >
          <input
            value={other}
            onChange={(e) => setOther(e.target.value)}
            placeholder={t("picker.otherSize")}
            aria-label={t("picker.otherSize")}
            autoComplete="off"
            enterKeyHint="done"
            className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-12 min-w-0 flex-1 rounded-md border px-3 text-base outline-none focus-visible:ring-[3px]"
          />
          <Button type="submit" variant="outline" className="h-12 px-5 text-base" disabled={!other.trim()}>
            {t("picker.ok")}
          </Button>
        </form>

        <DrawerFooter className="pt-3">
          <Button
            type="button"
            variant="ghost"
            className="h-12 text-base"
            onClick={() => onPick("")}
            disabled={!value}
          >
            {t("picker.clearSize")}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

/**
 * La case d'AppSheet : la valeur choisie, et un « + » au bout. Toute la case
 * ouvre la liste ; la croix, quand il y a une valeur, la vide sans l'ouvrir.
 */
export function PickerField({
  id,
  value,
  placeholder,
  onOpen,
  onClear,
  invalid,
  secondary,
  className,
}: {
  id?: string;
  value: string;
  placeholder: string;
  onOpen: () => void;
  onClear?: () => void;
  invalid?: boolean;
  secondary?: React.ReactNode;
  className?: string;
}) {
  const t = useTranslations();
  return (
    <div className={cn("relative", className)}>
      <button
        id={id}
        type="button"
        onClick={onOpen}
        // `aria-invalid` n'existe pas sur un bouton : l'erreur est annoncée par
        // le message sous la section ; ici, seule la bordure la signale.
        data-invalid={invalid || undefined}
        aria-haspopup="dialog"
        className={cn(
          "border-input bg-background flex min-h-12 w-full items-center gap-2 rounded-md border ps-3 text-start text-base transition-colors",
          "focus-visible:border-ring focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]",
          "data-[invalid=true]:border-destructive",
          value && onClear ? "pe-12" : "pe-3",
        )}
      >
        <span className="min-w-0 flex-1 py-1.5">
          <span className={cn("block truncate", !value && "text-muted-foreground")}>
            {value || placeholder}
          </span>
          {secondary && <span className="block truncate text-xs">{secondary}</span>}
        </span>
        {!(value && onClear) && <Plus className="text-muted-foreground size-5 shrink-0" aria-hidden />}
      </button>
      {value && onClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label={t("picker.clearValue", { value })}
          className="text-muted-foreground hover:text-destructive absolute end-0.5 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
