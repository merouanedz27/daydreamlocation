"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Shirt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Link, useRouter } from "@/i18n/navigation";
import { Highlight } from "@/components/highlight";
import { sheet } from "@/components/sheet-table";
import { StockModelMenu, type MenuModel } from "@/components/stock-model-menu";
import { ViewToggle, type ListView } from "@/components/view-toggle";
import { createDeviceSetting } from "@/lib/device-setting";
import { CURRENCY_SUFFIX, formatMoney, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/routing";

/** Un modèle prêt à afficher : tout est calculé côté serveur. */
export type StockModelRow = {
  id: number;
  name: string;
  ref: string;
  category: string | null;
  price: number;
  /** URL publique de la photo, ou `null`. */
  photo: string | null;
  available: number;
  total: number;
  /** Tailles distinctes des pièces en stock, triées. */
  sizes: string[];
};

/*
 * Affichage par appareil, comme pour les commandes. Les cartes à photo
 * restent l'affichage par défaut : c'est l'écran que l'équipe connaît. Le
 * tableau, sans photo, sert à parcourir vite un grand catalogue.
 */
const viewSetting = createDeviceSetting<ListView>({
  key: "daydream.stock.view",
  fallback: "list",
  sanitize: (value) => (value === "list" || value === "table" ? value : null),
});

/** Durée de l'appui long, comme la sélection de la liste des commandes. */
const HOLD_MS = 500;

/**
 * Appui long sur un modèle → son menu (administrateur seulement). Le doigt
 * qui glisse fait défiler la liste : au-delà de quelques pixels, ce n'est plus
 * un appui. Le « clic » du relâché qui suit un appui long est avalé, sinon il
 * ouvrirait la fiche sous le menu. Sur ordinateur, le clic droit fait pareil.
 */
function useHold(enabled: boolean, onHold: (model: StockModelRow) => void) {
  const press = useRef<{ timer: number; x: number; y: number } | null>(null);
  const held = useRef(false);

  const cancel = () => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  };

  return (model: StockModelRow) =>
    enabled
      ? {
          onPointerDown: (e: React.PointerEvent) => {
            if (e.pointerType === "mouse") return;
            cancel();
            held.current = false;
            const timer = window.setTimeout(() => {
              press.current = null;
              held.current = true;
              navigator.vibrate?.(30);
              onHold(model);
            }, HOLD_MS);
            press.current = { timer, x: e.clientX, y: e.clientY };
          },
          onPointerMove: (e: React.PointerEvent) => {
            const p = press.current;
            if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) cancel();
          },
          onPointerUp: cancel,
          onPointerCancel: cancel,
          onContextMenu: (e: React.MouseEvent) => {
            // Le menu natif (« Ouvrir dans un onglet »…) cède la place au nôtre.
            e.preventDefault();
            if (!held.current) onHold(model);
          },
          onClickCapture: (e: React.MouseEvent) => {
            if (held.current) {
              held.current = false;
              e.preventDefault();
              e.stopPropagation();
            }
          },
        }
      : {};
}

export function StockModels({
  models,
  archived,
  canEdit,
}: {
  models: StockModelRow[];
  archived: boolean;
  /** Administrateur : l'appui long ouvre le menu du modèle. */
  canEdit: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const { locale } = useParams<{ locale: Locale }>();
  const view = viewSetting.useValue();
  const [menu, setMenu] = useState<MenuModel | null>(null);
  const hold = useHold(canEdit, (m) => setMenu({ id: m.id, name: m.name, ref: m.ref }));
  // Pas de loupe ni de menu « copier le lien » d'iOS sous le doigt qui appuie.
  const holdable = canEdit && "select-none [-webkit-touch-callout:none]";

  return (
    <>
      <div className="mt-4 flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          {t("stock.modelCount", { count: formatNumber(models.length, locale) })}
        </p>
        <ViewToggle view={view} onChange={viewSetting.set} />
      </div>

      {view === "list" ? (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {models.map((model) => (
            <li key={model.id}>
              <Link
                href={`/stock/${model.id}`}
                {...hold(model)}
                className={cn(
                  "press border-border bg-card hover:border-gold-strong active:border-gold-strong flex [--press-scale:0.98] gap-3 rounded-lg border p-3",
                  holdable,
                )}
              >
                {/* Vignette carrée : sans photo, une icône plutôt qu'un trou. */}
                <div className="bg-muted relative size-20 shrink-0 overflow-hidden rounded-md">
                  {model.photo ? (
                    <Image src={model.photo} alt="" fill sizes="80px" className="object-cover" />
                  ) : (
                    <span className="text-muted-foreground flex size-full items-center justify-center">
                      <Shirt className="size-7" aria-hidden />
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    <Highlight text={model.name} />
                  </p>
                  <p className="text-muted-foreground mt-0.5 truncate text-sm">
                    <bdi>
                      <Highlight text={model.ref} />
                    </bdi>
                    {model.category && ` · ${model.category}`}
                  </p>

                  {model.sizes.length > 0 && (
                    <p className="text-muted-foreground mt-0.5 truncate text-xs">
                      {t("stock.size")} <bdi className="text-foreground font-medium">{model.sizes.join(" · ")}</bdi>
                    </p>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span className="tabular font-medium">{formatMoney(model.price, locale)}</span>
                    <span
                      className={cn(
                        "tabular",
                        model.available > 0 ? "text-success" : "text-muted-foreground",
                      )}
                    >
                      {t("stock.availableCount", {
                        available: model.available,
                        total: model.total,
                      })}
                    </span>
                    {archived && (
                      <Badge className="bg-muted text-muted-foreground border-transparent">
                        {t("stock.retired")}
                      </Badge>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        /* Tableau compact, sans photo. Cinq colonnes ; la catégorie se masque
           sur téléphone pour que les quatre autres tiennent sans défiler. */
        <div className={sheet.wrapper}>
          <table className={sheet.table}>
            <thead>
              <tr className={sheet.headRow}>
                <th scope="col" className={cn(sheet.th, "text-start")}>
                  <span className={sheet.thInner}>{t("stock.short.ref")}</span>
                </th>
                <th scope="col" className={cn(sheet.th, "text-start")}>
                  <span className={sheet.thInner}>{t("stock.short.model")}</span>
                </th>
                <th scope="col" className={cn(sheet.th, "hidden text-start sm:table-cell")}>
                  <span className={sheet.thInner}>{t("stock.short.category")}</span>
                </th>
                <th scope="col" className={cn(sheet.th, "text-end")}>
                  <span className={cn(sheet.thInner, "justify-end")}>
                    {t("orders.withCurrency", {
                      label: t("stock.price"),
                      currency: CURRENCY_SUFFIX[locale],
                    })}
                  </span>
                </th>
                <th scope="col" className={cn(sheet.th, "text-end")}>
                  <span className={cn(sheet.thInner, "justify-end")}>
                    {t("stock.short.available")}
                  </span>
                </th>
              </tr>
            </thead>

            <tbody>
              {models.map((model) => (
                /* Ligne entière cliquable ; le vrai lien reste dans la première
                   cellule (même principe que le tableau des commandes). */
                <tr
                  key={model.id}
                  {...hold(model)}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("a,button")) return;
                    router.push(`/stock/${model.id}`, { locale });
                  }}
                  className={cn(sheet.row, holdable)}
                >
                  <td className={cn(sheet.td, "text-start md:whitespace-nowrap")}>
                    <Link href={`/stock/${model.id}`} className={sheet.rowLink}>
                      <bdi className="block min-w-14 wrap-anywhere">
                        <Highlight text={model.ref} />
                      </bdi>
                    </Link>
                  </td>
                  <td className={cn(sheet.td, "text-start")}>
                    <span className="block min-w-14 wrap-anywhere">
                      <Highlight text={model.name} />
                    </span>
                    {model.sizes.length > 0 && (
                      <bdi className="text-muted-foreground block text-xs">
                        {model.sizes.join(" · ")}
                      </bdi>
                    )}
                  </td>
                  <td className={cn(sheet.td, "text-muted-foreground hidden text-start sm:table-cell")}>
                    {model.category ?? "—"}
                  </td>
                  <td className={cn(sheet.td, "tabular text-end whitespace-nowrap")}>
                    {formatNumber(model.price, locale)}
                  </td>
                  <td
                    className={cn(
                      sheet.td,
                      "tabular text-end whitespace-nowrap",
                      model.available > 0 ? "text-success" : "text-muted-foreground",
                    )}
                    title={t("stock.availableCount", {
                      available: model.available,
                      total: model.total,
                    })}
                  >
                    {/* « disponibles / total » se lit de gauche à droite, même en arabe :
                        sans isolat, les deux nombres s'inversent (« 5 / 0 »). */}
                    <bdi dir="ltr">
                      {`${formatNumber(model.available, locale)} / ${formatNumber(model.total, locale)}`}
                    </bdi>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && (
        <StockModelMenu model={menu} archived={archived} onClose={() => setMenu(null)} />
      )}
    </>
  );
}
