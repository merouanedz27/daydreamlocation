"use client";

import { useTransition } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { Check } from "lucide-react";
import { FILTER_CHIP_CLASS, STATUSES, STATUS_TONE } from "@/lib/orders-query";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/routing";

const STATUS_KEYS: Record<string, string> = {
  reservee: "reserved",
  en_cours: "inProgress",
  retournee: "returned",
  annulee: "cancelled",
};

/**
 * Filtres de statut. La RECHERCHE, elle, est dans l'en-tête (`HeaderSearch`) :
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
  onClick,
}: {
  label: string;
  active: boolean;
  colors?: { idle: string; active: string };
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
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
      {label}
    </button>
  );
}
