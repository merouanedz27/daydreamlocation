"use client";

import { useState, useTransition } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { CalendarRange, Check } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CALENDAR_LOCALE, toCalendarDate, toIso } from "@/components/date-picker";
import { FILTER_CHIP_CLASS, STATUSES, STATUS_TONE } from "@/lib/orders-query";
import { formatDayMonth } from "@/lib/format";
import { addDays, startOfWeek, todayIso } from "@/lib/rental-range";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/routing";

const STATUS_KEYS: Record<string, string> = {
  reservee: "reserved",
  en_cours: "inProgress",
  retournee: "returned",
  annulee: "cancelled",
};

type DatePreset = "today" | "tomorrow" | "week" | "month";

/** Les périodes toutes faites, sur la date de l'ÉVÉNEMENT, bornes incluses. */
function presetRange(preset: DatePreset, locale: Locale): { du: string; au: string } {
  const today = todayIso();
  if (preset === "today") return { du: today, au: today };
  if (preset === "tomorrow") {
    const tomorrow = addDays(today, 1);
    return { du: tomorrow, au: tomorrow };
  }
  if (preset === "week") {
    const from = startOfWeek(today, locale);
    return { du: from, au: addDays(from, 6) };
  }
  const first = `${today.slice(0, 8)}01`;
  return { du: first, au: addDays(`${addDays(first, 32).slice(0, 8)}01`, -1) };
}

const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: "today", label: "orders.dateToday" },
  { key: "tomorrow", label: "orders.dateTomorrow" },
  { key: "week", label: "orders.dateWeek" },
  { key: "month", label: "orders.dateMonth" },
];

/**
 * Filtres de statut et de DATE, comme les filtres de son AppSheet. La date
 * est celle de l'ÉVÉNEMENT — celle qu'il saisit et que montre le calendrier. La RECHERCHE, elle, est dans l'en-tête (`HeaderSearch`) :
 * une seule barre pour toutes les listes de l'application. Les deux écrivent
 * dans la même URL, donc se combinent.
 *
 * Ils écrivent dans l'URL et non dans un état React : c'est le serveur qui
 * fait la requête, donc filtrer, trier et paginer restent cohérents entre eux.
 * Et une liste filtrée devient un lien qu'un membre de l'équipe peut envoyer
 * à un autre.
 */
export function OrdersFilters() {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { locale } = useParams<{ locale: Locale }>();
  const [isPending, startTransition] = useTransition();

  const currentStatus = params.get("statut");
  const du = params.get("du");
  const au = params.get("au");
  const activePreset = DATE_PRESETS.find((p) => {
    const range = presetRange(p.key, locale);
    return range.du === du && range.au === au;
  })?.key;
  const customActive = Boolean((du || au) && !activePreset);

  // Le même calendrier que la date de l'événement dans « Nouvelle commande »,
  // en mode PLAGE : un toucher sur le premier jour, un sur le dernier.
  const [rangeOpen, setRangeOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>();

  function onRangeOpenChange(open: boolean) {
    if (open) {
      setDraft(du || au ? { from: toCalendarDate(du ?? au!), to: au ? toCalendarDate(au) : undefined } : undefined);
    }
    setRangeOpen(open);
  }

  function applyRange(range: DateRange | undefined) {
    if (!range?.from) return;
    const from = toIso(range.from);
    push({ du: from, au: range.to ? toIso(range.to) : from });
    setRangeOpen(false);
  }

  // « 12/10 → 20/10 », « dès 12/10 », « jusqu'au 20/10 » sur la puce choisie.
  const customLabel = customActive
    ? du && au
      ? du === au
        ? formatDayMonth(du, locale)
        : `${formatDayMonth(du, locale)} → ${formatDayMonth(au, locale)}`
      : du
        ? t("orders.dateSince", { date: formatDayMonth(du, locale) })
        : t("orders.dateUntil", { date: formatDayMonth(au!, locale) })
    : t("orders.dateRange");

  function push(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    // Tout changement de filtre ramène en première page : rester en page 3
    // d'un résultat qui n'en compte qu'une afficherait un vide trompeur.
    next.delete("page");
    const qs = next.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { locale });
    });
  }

  return (
    <div className={cn("mt-4", isPending && "opacity-70")}>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 max-md:scrollbar-none">
        <Chip
          label={t("orders.allStatuses")}
          active={!currentStatus}
          onClick={() => push({ statut: null })}
        />
        {STATUSES.map((s) => (
          <Chip
            key={s}
            label={t(`orders.status.${STATUS_KEYS[s]}`)}
            active={currentStatus === s}
            colors={FILTER_CHIP_CLASS[STATUS_TONE[s]]}
            onClick={() => push({ statut: currentStatus === s ? null : s })}
          />
        ))}
      </div>

      <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 max-md:scrollbar-none">
        <Chip
          label={t("orders.dateAll")}
          active={!du && !au}
          onClick={() => push({ du: null, au: null })}
        />
        {DATE_PRESETS.map((p) => (
          <Chip
            key={p.key}
            label={t(p.label)}
            active={activePreset === p.key}
            onClick={() =>
              push(activePreset === p.key ? { du: null, au: null } : presetRange(p.key, locale))
            }
          />
        ))}
        <Popover open={rangeOpen} onOpenChange={onRangeOpenChange}>
          <PopoverTrigger asChild>
            <Chip
              label={customLabel}
              active={customActive}
              icon={<CalendarRange className="size-3.5" aria-hidden />}
            />
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="range"
              selected={draft}
              defaultMonth={draft?.from}
              onSelect={(range) => {
                setDraft(range);
                // Deux jours différents choisis : la plage est complète.
                if (range?.from && range.to && range.from.getTime() !== range.to.getTime()) {
                  applyRange(range);
                }
              }}
              locale={CALENDAR_LOCALE[locale]}
              dir={locale === "ar" ? "rtl" : "ltr"}
              className="[--cell-size:--spacing(11)]"
            />
            {/* Un seul jour : le choisir, puis valider. */}
            <div className="border-border flex gap-2 border-t p-2">
              {(du || au) && (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 flex-1"
                  onClick={() => {
                    push({ du: null, au: null });
                    setRangeOpen(false);
                  }}
                >
                  {t("orders.dateAll")}
                </Button>
              )}
              <Button
                type="button"
                className="h-11 flex-1"
                disabled={!draft?.from}
                onClick={() => applyRange(draft)}
              >
                {t("orders.dateApply")}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

/**
 * Une puce de filtre. Celles des statuts portent la couleur de leurs lignes
 * (jaune réservée, rouge en cours…) : on sait ce qu'on va voir avant de
 * toucher. Choisie, elle se remplit et prend un ✓ — jamais la couleur seule.
 */
function Chip({
  label,
  active,
  colors,
  icon,
  ...rest
}: {
  label: string;
  active: boolean;
  colors?: { idle: string; active: string };
  icon?: React.ReactNode;
} & React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      {...rest}
      aria-pressed={active}
      className={cn(
        "flex min-h-10 shrink-0 items-center gap-1 rounded-full border px-3 text-sm transition-colors",
        colors
          ? active
            ? cn(colors.active, "border-foreground/40 text-foreground border-2 font-semibold")
            : cn(colors.idle, "text-foreground hover:brightness-95")
          : active
            ? "border-primary bg-primary text-primary-foreground font-medium"
            : "border-border text-muted-foreground hover:bg-muted",
      )}
    >
      {active && colors && <Check className="size-3.5" aria-hidden />}
      {icon}
      <bdi>{label}</bdi>
    </button>
  );
}
