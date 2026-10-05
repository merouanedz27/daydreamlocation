"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, Search, X } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * Pages dont la LISTE se filtre par `?q=`, et ce que la barre y cherche.
 * Ailleurs (fiche, formulaire, bilan…), une recherche part dans les commandes.
 */
const SCOPES: { test: RegExp; placeholder: string }[] = [
  { test: /^\/commandes(\/(calendrier|demain|pas-rentres))?$/, placeholder: "search.orders" },
  { test: /^\/stock$/, placeholder: "search.stock" },
  { test: /^\/stock\/ensembles$/, placeholder: "search.ensembles" },
  { test: /^\/frais$/, placeholder: "search.frais" },
  { test: /^\/pressing$/, placeholder: "search.pressing" },
  { test: /^\/equipe$/, placeholder: "search.team" },
];

const FIELD = "q";

/**
 * La recherche de l'en-tête — la loupe de son AppSheet.
 *
 * UNE barre pour toute l'application : elle filtre la liste de la page en
 * cours (commandes, calendrier, stock, frais…) en écrivant `?q=` dans l'URL,
 * que chaque page lit côté serveur. Sur une page sans liste, elle cherche
 * dans les commandes — ce qu'on cherche neuf fois sur dix quand un client
 * appelle.
 *
 * Bureau : un champ toujours visible. Téléphone : une loupe qui, touchée,
 * recouvre la barre d'un champ plein largeur — exactement le geste
 * d'AppSheet, sans voler une ligne d'écran quand on ne cherche pas.
 *
 * Le composant est remonté à chaque changement de page (`key` posée par
 * l'en-tête) : il repart du `q` de la nouvelle URL, et la loupe se rouvre
 * d'elle-même si une recherche y est déjà active.
 */
export function HeaderSearch() {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const applied = params.get(FIELD) ?? "";
  const [term, setTerm] = useState(applied);
  const [open, setOpen] = useState(Boolean(applied));
  const mobileInput = useRef<HTMLInputElement>(null);

  const scope = SCOPES.find((s) => s.test.test(pathname));
  const placeholder = t(scope?.placeholder ?? "search.orders");

  function apply(value: string) {
    const clean = value.trim();
    if (!scope) {
      // Hors liste : on part dans les commandes, et seulement à la validation
      // — quitter la page à la première lettre tapée serait brutal.
      if (clean) router.push(`/commandes?${FIELD}=${encodeURIComponent(clean)}`);
      return;
    }
    const next = new URLSearchParams(params.toString());
    if (clean) next.set(FIELD, clean);
    else next.delete(FIELD);
    // Une nouvelle recherche repart de la première page.
    next.delete("page");
    const qs = next.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    });
  }

  // Sur une page à liste, le filtre suit la frappe, différé : on ne relance
  // pas une requête par lettre sur un réseau mobile.
  useEffect(() => {
    if (!scope || term.trim() === applied) return;
    const timer = setTimeout(() => apply(term), 250);
    return () => clearTimeout(timer);
    // `apply` change à chaque rendu ; seul le terme doit relancer le délai.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  function clear() {
    setTerm("");
    apply("");
  }

  function close() {
    setOpen(false);
    if (applied) clear();
  }

  const field = (className: string, ref?: React.Ref<HTMLInputElement>) => (
    <form
      role="search"
      className={cn("relative", className)}
      onSubmit={(e) => {
        e.preventDefault();
        apply(term);
        // Ferme le clavier du téléphone : la liste filtrée se voit en entier.
        (e.currentTarget.querySelector("input") as HTMLInputElement | null)?.blur();
      }}
    >
      <Search
        className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
        aria-hidden
      />
      <input
        ref={ref}
        type="search"
        name={FIELD}
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete="off"
        enterKeyHint="search"
        // Fond CLAIR sur la barre brune : le champ se repère d'un coup d'œil,
        // et son texte garde le contraste de la page (encre sur blanc).
        className="bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-gold-soft h-10 w-full min-w-0 rounded-md ps-9 pe-10 text-base outline-none focus-visible:ring-2 md:text-sm [&::-webkit-search-cancel-button]:hidden"
      />
      {(term || isPending) && (
        <button
          type="button"
          onClick={clear}
          aria-label={t("search.clear")}
          className="text-muted-foreground hover:text-foreground active:text-foreground absolute end-0 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center"
        >
          {isPending ? <Spinner className="size-4" /> : <X className="size-4" aria-hidden />}
        </button>
      )}
    </form>
  );

  return (
    <>
      {/* Bureau : toujours là, il prend la place qui reste entre la
          navigation et le compte, et rétrécit avant elle. */}
      {field("hidden min-w-0 flex-1 md:ms-auto md:block md:max-w-xs")}

      {/* Téléphone : la loupe. */}
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          // Le champ n'existe qu'après le rendu.
          requestAnimationFrame(() => mobileInput.current?.focus());
        }}
        aria-label={t("search.open")}
        aria-expanded={open}
        className="press text-nav-muted hover:bg-nav-foreground/8 hover:text-nav-foreground active:bg-nav-foreground/15 relative ms-auto flex size-11 items-center justify-center rounded-md md:hidden"
      >
        <Search className="size-5" aria-hidden />
        {/* Une recherche est active sur cette page : la pastille le rappelle
            même loupe fermée. */}
        {applied && (
          <span className="bg-gold-soft absolute end-2 top-2 size-2 rounded-full" aria-hidden />
        )}
      </button>

      {open && (
        <div className="bg-nav absolute inset-0 z-10 flex items-center gap-1 px-2 md:hidden">
          <button
            type="button"
            onClick={close}
            aria-label={t("search.close")}
            className="press text-nav-foreground hover:bg-nav-foreground/8 active:bg-nav-foreground/15 flex size-11 shrink-0 items-center justify-center rounded-md"
          >
            <ArrowLeft className="size-5 rtl:-scale-x-100" aria-hidden />
          </button>
          {field("min-w-0 flex-1", mobileInput)}
        </div>
      )}
    </>
  );
}
