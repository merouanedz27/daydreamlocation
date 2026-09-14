"use client";

import { useTransition } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
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

const FIELD = "q";

/**
 * Recherche et filtres de statut.
 *
 * Ils écrivent dans l'URL et non dans un état React : c'est le serveur qui
 * fait la requête, donc filtrer, trier et paginer restent cohérents entre eux.
 * Et une liste filtrée devient un lien qu'un membre de l'équipe peut envoyer
 * à un autre.
 *
 * Le champ est NON CONTRÔLÉ, avec `key={applied}` : quand l'URL change (retour
 * navigateur, effacement), React remonte l'input avec la nouvelle valeur par
 * défaut. Pas de `useState` à resynchroniser, donc pas d'effet de
 * synchronisation — la source de vérité reste l'URL, à un seul endroit.
 */
export function OrdersFilters() {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { locale } = useParams<{ locale: Locale }>();
  const [isPending, startTransition] = useTransition();

  const applied = params.get(FIELD) ?? "";
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
    <div className="mt-4 space-y-3">
      <form
        role="search"
        className="relative"
        onSubmit={(e) => {
          e.preventDefault();
          const value = new FormData(e.currentTarget).get(FIELD);
          push({ [FIELD]: String(value ?? "") });
        }}
      >
        <Search
          className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          key={applied}
          name={FIELD}
          defaultValue={applied}
          // Chercher en quittant le champ évite d'avoir à viser « Entrée » sur
          // un clavier de téléphone.
          onBlur={(e) => {
            if (e.target.value !== applied) push({ [FIELD]: e.target.value });
          }}
          placeholder={t("orders.searchPlaceholder")}
          aria-label={t("common.search")}
          className="h-12 px-10 text-base"
          autoComplete="off"
          type="search"
        />

        {applied && (
          <button
            type="button"
            onClick={() => push({ [FIELD]: null })}
            aria-label={t("orders.clearSearch")}
            className="text-muted-foreground hover:text-foreground absolute end-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full"
          >
            {isPending ? <Spinner className="size-4" /> : <X className="size-4" aria-hidden />}
          </button>
        )}
      </form>

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
