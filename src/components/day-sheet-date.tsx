"use client";

import { useTransition } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { DatePicker } from "@/components/date-picker";
import { usePathname, useRouter } from "@/i18n/navigation";
import { addDays, type IsoDate } from "@/lib/rental-range";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/routing";

/**
 * Choix de la journée de la feuille. La date vit dans l'URL (`?date=`) : c'est
 * le serveur qui lit les commandes, et un lien « feuille de demain » s'envoie
 * tel quel à un collègue.
 *
 * « Aujourd'hui » et « Demain » en raccourcis : ce sont les deux seules
 * journées qu'on prépare vraiment — la veille au soir, ou le matin même.
 */
export function DaySheetDate({ date, today }: { date: IsoDate; today: IsoDate }) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const { locale } = useParams<{ locale: Locale }>();
  const [isPending, startTransition] = useTransition();

  const tomorrow = addDays(today, 1);

  function go(next: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) return;
    startTransition(() => {
      router.replace(`${pathname}?date=${next}`, { locale });
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor="day-sheet-date" className="sr-only">
        {t("orders.sectionDate")}
      </label>
      <DatePicker
        id="day-sheet-date"
        value={date}
        onChange={go}
        className="bg-background h-11 w-auto"
      />
      {(
        [
          [today, t("orders.today")],
          [tomorrow, t("orders.tomorrow")],
        ] as const
      ).map(([value, label]) => (
        <Button
          key={value}
          type="button"
          variant="outline"
          onClick={() => go(value)}
          aria-pressed={date === value}
          className={cn("h-11", date === value && "bg-gold-soft border-transparent")}
        >
          {label}
        </Button>
      ))}
      {isPending && <Spinner className="text-muted-foreground" />}
    </div>
  );
}
