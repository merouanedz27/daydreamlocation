"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { CalendarDays } from "lucide-react";
import type { Matcher } from "react-day-picker";
import { arDZ, fr } from "react-day-picker/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDate } from "@/lib/format";
import type { IsoDate } from "@/lib/rental-range";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/routing";

/**
 * `ar-DZ` et non `ar` : la variante algérienne. Les jours restent en chiffres
 * latins dans les deux langues, comme `formatDate`.
 */
export const CALENDAR_LOCALE = { fr, ar: arDZ } as const;

/**
 * `YYYY-MM-DD` → `Date` à minuit LOCAL, et retour par les accesseurs locaux.
 *
 * Le calendrier raisonne en jours de l'appareil. Passer par `new Date(iso)`
 * (minuit UTC) puis `toISOString()` décalerait d'un jour sur tout fuseau
 * négatif : un tap sur le 14 enregistrerait le 13.
 */
export function toCalendarDate(iso: IsoDate): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function toIso(date: Date): IsoDate {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

/**
 * Sélecteur de date — un bouton qui ouvre un calendrier.
 *
 * Remplace `<input type="date">`, dont l'apparence change d'un téléphone à
 * l'autre et qui affiche le format du TÉLÉPHONE (parfois `MM/dd`) au lieu du
 * `dd/MM/yyyy` imposé partout ailleurs — cf. `formatDate`.
 *
 * La valeur reste une chaîne `YYYY-MM-DD` (ou `""`), comme le reste de l'app.
 * `name` ajoute un champ caché pour les formulaires lus par `FormData`.
 *
 * Cases de 44 px : le calendrier se touche au pouce. Sept colonnes tiennent
 * dans un écran de 390 px.
 */
export function DatePicker({
  id,
  value,
  onChange,
  name,
  placeholder,
  disabled,
  invalid,
  disabledDays,
  className,
}: {
  id?: string;
  value: IsoDate | "";
  onChange: (value: IsoDate) => void;
  name?: string;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  /** Jours non sélectionnables, par exemple un retour avant le retrait. */
  disabledDays?: Matcher | Matcher[];
  className?: string;
}) {
  const { locale } = useParams<{ locale: Locale }>();
  const [open, setOpen] = useState(false);
  const selected = value ? toCalendarDate(value) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {name && <input type="hidden" name={name} value={value} />}
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-invalid={invalid || undefined}
          className={cn("h-12 w-full justify-start text-base font-normal", className)}
        >
          <CalendarDays className="text-muted-foreground size-4" aria-hidden />
          {value ? (
            <span className="tabular">{formatDate(value, locale)}</span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          // `required` : un second tap sur le jour choisi ne vide pas le champ.
          required
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            onChange(toIso(date));
            setOpen(false);
          }}
          disabled={disabledDays}
          locale={CALENDAR_LOCALE[locale]}
          // Sans `dir`, les flèches du clavier restent inversées en arabe.
          dir={locale === "ar" ? "rtl" : "ltr"}
          className="[--cell-size:--spacing(11)]"
        />
      </PopoverContent>
    </Popover>
  );
}
