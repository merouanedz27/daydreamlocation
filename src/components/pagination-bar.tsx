"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { PER_PAGE_OPTIONS } from "@/lib/orders-query";
import { formatNumber } from "@/lib/format";
import type { Locale } from "@/i18n/routing";

/**
 * Barre de pagination : taille de page, page précédente, page suivante.
 *
 * ÉTAT DANS L'URL, PAS DANS LE COMPOSANT. La page et la taille de page sont
 * appliquées EN BASE (`.range()`), pas sur les lignes déjà chargées : elles
 * doivent donc voyager jusqu'au serveur. Un `useState` ici ne survivrait ni au
 * partage d'un lien, ni au bouton « retour » du téléphone, ni au
 * rafraîchissement — et surtout ne changerait rien à la requête.
 *
 * Changer la taille de page REPART EN PAGE 1 : « page 7 » ne veut pas dire la
 * même chose à 10 et à 100 lignes par page, et garder le numéro enverrait sur
 * une page vide.
 */
export function PaginationBar({
  page,
  perPage,
  total,
}: {
  page: number;
  perPage: number;
  total: number;
}) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const lastPage = Math.max(1, Math.ceil(total / perPage));

  function href(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  // La taille de page ne s'affiche pas quand même le plus petit choix tiendrait
  // sur une seule page : un réglage qui ne peut rien changer n'a rien à faire
  // sous les yeux de l'équipe.
  const showPerPage = total > PER_PAGE_OPTIONS[0];
  if (lastPage <= 1 && !showPerPage) return null;

  /**
   * Le libellé d'un bouton de page, ICÔNE COMPRISE.
   *
   * Il est rendu en enfant DIRECT du `Button`, jamais enveloppé dans un
   * `<span>`. Tailwind met `display: block` sur les `svg` : dans un `span`,
   * qui n'est pas un conteneur flex, la flèche passe alors à la ligne et le
   * bouton désactivé s'affiche sur deux lignes — le défaut visible en bout de
   * liste, quand « Précédent » est grisé.
   */
  const previous = (
    <>
      <ChevronLeft className="size-4 rtl:-scale-x-100" aria-hidden />
      {t("common.previous")}
    </>
  );

  const next = (
    <>
      {t("common.next")}
      <ChevronRight className="size-4 rtl:-scale-x-100" aria-hidden />
    </>
  );

  return (
    <nav
      className="mt-6 flex flex-wrap items-center justify-between gap-3"
      aria-label={t("common.pagination")}
    >
      {showPerPage && (
        <div className="flex items-center gap-2">
          <label htmlFor="per-page" className="text-muted-foreground text-sm">
            {t("common.perPage")}
          </label>
          <Select
            value={String(perPage)}
            onValueChange={(value) =>
              router.push(href({ taille: value, page: null }), { locale })
            }
          >
            <SelectTrigger id="per-page" className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {PER_PAGE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {formatNumber(n, locale)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      )}

      {lastPage > 1 && (
        // Pleine largeur sur téléphone : les deux flèches se posent chacune
        // dans un coin, sous le pouce, avec le numéro de page au milieu.
        <div className="flex w-full items-center justify-between gap-2 sm:w-auto">
          {page > 1 ? (
            <Button asChild variant="outline" className="h-11">
              <Link href={href({ page: String(page - 1) })}>{previous}</Link>
            </Button>
          ) : (
            <Button variant="outline" className="h-11" disabled>
              {previous}
            </Button>
          )}

          <span className="text-muted-foreground tabular text-sm">
            {t("common.pageOf", {
              page: formatNumber(page, locale),
              total: formatNumber(lastPage, locale),
            })}
          </span>

          {page < lastPage ? (
            <Button asChild variant="outline" className="h-11">
              <Link href={href({ page: String(page + 1) })}>{next}</Link>
            </Button>
          ) : (
            <Button variant="outline" className="h-11" disabled>
              {next}
            </Button>
          )}
        </div>
      )}
    </nav>
  );
}
