"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type SuggestOption = {
  key: string;
  primary: React.ReactNode;
  secondary?: React.ReactNode;
  trailing?: React.ReactNode;
  disabled?: boolean;
  onPick: () => void;
};

export { normalizeSearch } from "@/lib/search";

/**
 * Passe au champ suivant de la saisie rapide, comme la touche « suivant » du
 * clavier d'un téléphone. Seuls les champs marqués `data-field` comptent : on
 * saute les boutons, les cases et les champs masqués.
 */
export function focusNextField(from: HTMLElement) {
  const form = from.closest("form");
  if (!form) return;
  const fields = [...form.querySelectorAll<HTMLElement>("[data-field]")].filter(
    (el) => !(el as HTMLInputElement).disabled && el.offsetParent !== null,
  );
  const next = fields[fields.indexOf(from) + 1];
  if (next) next.focus();
  else from.blur(); // dernier champ : on referme le clavier
}

/**
 * Un champ TEXTE LIBRE qui propose des suggestions sous lui — la liste
 * déroulante d'AppSheet, sans en avoir la contrainte : ce qu'on tape est
 * accepté tel quel, la suggestion ne fait que l'écrire plus vite.
 *
 * La liste s'affiche dans la page, juste sous le champ, et non dans une
 * fenêtre flottante détachée : sur téléphone, le clavier virtuel déplace la
 * page et une fenêtre détachée se retrouve sous le clavier.
 */
export function SuggestInput({
  options,
  value,
  onValueChange,
  invalid,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "value" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
  options: SuggestOption[];
  invalid?: boolean;
}) {
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(-1);
  const open = focused && options.length > 0;

  function pick(option: SuggestOption, input: HTMLElement) {
    if (option.disabled) return;
    option.onPick();
    setActive(-1);
    focusNextField(input);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (event.key === "Enter" && active >= 0 && options[active]) {
      // `preventDefault` : le formulaire voit l'événement déjà traité et ne
      // passe pas lui-même au champ suivant.
      event.preventDefault();
      pick(options[active], event.currentTarget);
    } else if (event.key === "Escape") {
      setFocused(false);
    }
  }

  return (
    <div className="relative">
      <Input
        {...props}
        data-field
        value={value}
        onChange={(e) => {
          onValueChange(e.target.value);
          setActive(-1);
          setFocused(true);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={invalid || undefined}
        autoComplete="off"
        className={cn("h-12 text-base", className)}
      />

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="bg-background border-border absolute inset-x-0 top-full z-40 mt-1 max-h-72 overflow-y-auto rounded-lg border p-1 shadow-md"
          // Le champ ne doit pas perdre le focus avant le toucher : sinon la
          // liste disparaît sous le doigt et rien n'est choisi.
          onMouseDown={(e) => e.preventDefault()}
        >
          {options.map((option, i) => (
            <li key={option.key} role="option" aria-selected={i === active}>
              <button
                type="button"
                tabIndex={-1}
                disabled={option.disabled}
                onClick={(e) => {
                  const input = e.currentTarget
                    .closest("div.relative")
                    ?.querySelector<HTMLElement>("[data-field]");
                  if (input) pick(option, input);
                }}
                className={cn(
                  "flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-1.5 text-start",
                  option.disabled
                    ? "cursor-not-allowed opacity-55"
                    : "hover:bg-accent active:bg-accent",
                  i === active && "bg-accent",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{option.primary}</span>
                  {option.secondary && (
                    <span className="text-muted-foreground block truncate text-xs">
                      {option.secondary}
                    </span>
                  )}
                </span>
                {option.trailing && <span className="shrink-0 text-sm">{option.trailing}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
