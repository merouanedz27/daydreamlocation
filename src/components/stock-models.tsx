"use client";

import Image from "next/image";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Shirt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Link, useRouter } from "@/i18n/navigation";
import { sheet } from "@/components/sheet-table";
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

export function StockModels({
  models,
  archived,
}: {
  models: StockModelRow[];
  archived: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const { locale } = useParams<{ locale: Locale }>();
  const view = viewSetting.useValue();

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
                className="press border-border bg-card hover:border-gold-strong active:border-gold-strong flex [--press-scale:0.98] gap-3 rounded-lg border p-3"
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
                  <p className="truncate font-medium">{model.name}</p>
                  <p className="text-muted-foreground mt-0.5 truncate text-sm">
                    <bdi>{model.ref}</bdi>
                    {model.category && ` · ${model.category}`}
                  </p>

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
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("a,button")) return;
                    router.push(`/stock/${model.id}`, { locale });
                  }}
                  className={sheet.row}
                >
                  <td className={cn(sheet.td, "text-start md:whitespace-nowrap")}>
                    <Link href={`/stock/${model.id}`} className={sheet.rowLink}>
                      <bdi className="block min-w-14 wrap-anywhere">{model.ref}</bdi>
                    </Link>
                  </td>
                  <td className={cn(sheet.td, "text-start")}>
                    <span className="block min-w-14 wrap-anywhere">{model.name}</span>
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
    </>
  );
}
