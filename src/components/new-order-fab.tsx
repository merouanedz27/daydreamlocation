"use client";

import { Pencil, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { useParked } from "@/lib/parked-drafts";
import { formatNumber } from "@/lib/format";
import type { Locale } from "@/i18n/routing";

/** Écrans où le « + » flotte : les quatre listes de commandes. */
const SHOWN_ON = [
  "/commandes",
  "/commandes/calendrier",
  "/commandes/demain",
  "/commandes/pas-rentres",
];

/** La fiche d'une commande : le bouton rond y devient « Modifier ». */
const ORDER_PAGE = /^\/commandes\/(\d+)$/;

/**
 * Le bouton rond d'AppSheet : en bas, côté fin, au-dessus de la barre
 * d'onglets — là où le pouce de la main droite tombe sans bouger (côté gauche
 * en arabe, `end-4` se retourne tout seul).
 *
 * - Sur les listes : « + », nouvelle commande.
 * - Sur la fiche d'une commande : ✏️, qui rouvre la commande dans le MÊME
 *   formulaire que la saisie — à la même place, du même geste.
 *
 * Absent des formulaires eux-mêmes et des écrans hors commandes : un bouton
 * posé SUR une saisie en cours finit par être touché par erreur.
 *
 * Sur le « + », une pastille compte les clients EN ATTENTE sur ce téléphone :
 * personne n'oublie un client mis de côté pendant qu'on en servait un autre.
 *
 * Le bloc vide réserve sa hauteur en bas de page : sans lui, le bouton
 * masquerait la dernière ligne de la liste, ou le bas de la fiche.
 */
export function NewOrderFab() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const waiting = useParked().length;

  const orderId = ORDER_PAGE.exec(pathname)?.[1];
  if (!orderId && !SHOWN_ON.includes(pathname)) return null;

  const href = orderId ? `/commandes/${orderId}/modifier` : "/commandes/nouvelle";
  const badge = !orderId && waiting > 0;
  const label = orderId
    ? t("orders.edit.action")
    : badge
      ? t("orders.parked.fabLabel", { count: waiting, n: formatNumber(waiting, locale) })
      : t("nav.new");
  const Icon = orderId ? Pencil : Plus;

  return (
    <>
      <div className="h-20 md:hidden" aria-hidden />
      <Link
        href={href}
        aria-label={label}
        title={label}
        className="bg-primary text-primary-foreground focus-visible:ring-ring fixed end-4 bottom-[calc(3.5rem+env(safe-area-inset-bottom)+1rem)] z-40 flex size-14 items-center justify-center rounded-full shadow-lg transition-transform focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-95 md:hidden"
      >
        <Icon className={orderId ? "size-6" : "size-7"} aria-hidden />
        {badge && (
          <span
            aria-hidden
            className="bg-notification-badge text-notification-badge-foreground tabular absolute -end-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-semibold"
          >
            {formatNumber(waiting, locale)}
          </span>
        )}
      </Link>
    </>
  );
}
