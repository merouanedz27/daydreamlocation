"use client";

import { useTransition } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { STATUSES } from "@/lib/orders-query";
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
            onClick={() => push({ statut: currentStatus === s ? null : s })}
          />
        ))}
      </div>
    </div>
  );
}

function Chip({
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
