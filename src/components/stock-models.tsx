"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Ellipsis, Shirt, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SelectBox } from "@/components/select-box";
import { Link, useRouter } from "@/i18n/navigation";
import { Highlight } from "@/components/highlight";
import { sheet } from "@/components/sheet-table";
import { StockModelMenu, type MenuModel } from "@/components/stock-model-menu";
import { removeModels, setModelsActive } from "@/lib/actions/stock";
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
  /** Prix d'achat d'une pièce : fait le chiffre d'affaires. */
  purchasePrice: number;
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
 * Appui long sur un modèle → il se SÉLECTIONNE (administrateur seulement),
 * comme dans la liste des commandes. Ensuite, chaque toucher coche ou décoche
 * au lieu d'ouvrir la fiche. Le doigt qui glisse fait défiler la liste : au-delà
 * de quelques pixels, ce n'est plus un appui. Le « clic » du relâché qui suit
 * un appui long est avalé. Sur ordinateur, le clic droit fait pareil.
 */
function useHold(
  enabled: boolean,
  selecting: boolean,
  onHold: (model: StockModelRow) => void,
) {
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
              return;
            }
            // En mode sélection, toucher la ligne coche — sauf la case elle-même,
            // qui se coche seule.
            if (selecting && !(e.target as HTMLElement).closest("label,input")) {
              e.preventDefault();
              e.stopPropagation();
              onHold(model);
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
  /** Administrateur : l'appui long sélectionne (supprimer, retirer…). */
  canEdit: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const { locale } = useParams<{ locale: Locale }>();
  const view = viewSetting.useValue();
  const [menu, setMenu] = useState<MenuModel | null>(null);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, startTransition] = useTransition();
  // Un modèle supprimé ou retiré entre-temps ne reste pas « sélectionné » en douce.
  const visible = models.filter((m) => selected.has(m.id));
  const selecting = visible.length > 0;
  const allSelected = models.length > 0 && visible.length === models.length;

  function toggleOne(id: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const clear = () => setSelected(new Set());
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(models.map((m) => m.id)));
  const hold = useHold(canEdit, selecting, (m) => toggleOne(m.id));

  const idsData = (extra: Record<string, string> = {}) => {
    const data = new FormData();
    data.set("locale", locale);
    data.set("ids", visible.map((m) => m.id).join(","));
    for (const [k, v] of Object.entries(extra)) data.set(k, v);
    return data;
  };

  function bulkArchive() {
    startTransition(async () => {
      const result = await setModelsActive(idsData({ active: archived ? "1" : "0" }));
      if (!result.ok) {
        toast.error(t(result.error));
        return;
      }
      clear();
      toast.success(
        t(archived ? "stock.restoredManyToast" : "stock.archivedManyToast", {
          count: result.count,
          n: formatNumber(result.count, locale),
        }),
      );
    });
  }

  const NAMES_SHOWN = 5;
  const deleteNames =
    visible
      .slice(0, NAMES_SHOWN)
      .map((m) => m.name)
      .join(", ") + (visible.length > NAMES_SHOWN ? "…" : "");
  // Pas de loupe ni de menu « copier le lien » d'iOS sous le doigt qui appuie.
  const holdable = canEdit && "select-none [-webkit-touch-callout:none]";

  return (
    <>
      {selecting ? (
        // La barre de la sélection prend la place du compteur, sous le pouce.
        <div
          role="toolbar"
          aria-label={t("stock.selectedCount", {
            count: visible.length,
            n: formatNumber(visible.length, locale),
          })}
          className="bg-gold-soft mt-4 flex flex-wrap items-center gap-1.5 rounded-lg p-1.5"
        >
          <Button
            type="button"
            variant="ghost"
            onClick={clear}
            aria-label={t("orders.clearSelection")}
            className="size-11"
          >
            <X className="size-5" aria-hidden />
          </Button>
          <SelectBox
            checked={allSelected}
            indeterminate={!allSelected}
            onChange={toggleAll}
            label={t("orders.selectAll")}
          />
          <span className="me-auto text-sm font-medium">
            {t("stock.selectedCount", {
              count: visible.length,
              n: formatNumber(visible.length, locale),
            })}
          </span>
          {/* Un seul modèle : ses gestes à lui (modifier, ajouter une pièce). */}
          {visible.length === 1 && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const m = visible[0];
                clear();
                setMenu({ id: m.id, name: m.name, ref: m.ref });
              }}
              aria-label={t("stock.moreActions")}
              className="bg-background size-11"
            >
              <Ellipsis className="size-5" aria-hidden />
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={bulkArchive}
            aria-label={t(archived ? "stock.restoreModel" : "stock.archiveModel")}
            className="bg-background size-11"
          >
            {busy ? (
              <Spinner className="size-4" />
            ) : archived ? (
              <ArchiveRestore className="size-5" aria-hidden />
            ) : (
              <Archive className="size-5" aria-hidden />
            )}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={() => setConfirmDelete(true)}
            className="h-11"
          >
            <Trash2 className="size-4" aria-hidden />
            {t("common.delete")}
          </Button>
        </div>
      ) : (
        <div className="mt-4 flex items-center justify-between gap-2">
          <p className="text-muted-foreground text-sm">
            {t("stock.modelCount", { count: formatNumber(models.length, locale) })}
          </p>
          <ViewToggle view={view} onChange={viewSetting.set} />
        </div>
      )}

      {view === "list" ? (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {models.map((model) => (
            <li key={model.id}>
              <Link
                href={`/stock/${model.id}`}
                {...hold(model)}
                aria-selected={canEdit ? selected.has(model.id) : undefined}
                className={cn(
                  "press border-border bg-card hover:border-gold-strong active:border-gold-strong flex [--press-scale:0.98] items-center gap-3 rounded-lg border p-3",
                  holdable,
                  selecting && "ps-0",
                  selected.has(model.id) && "border-gold-strong bg-gold-soft ring-gold-strong ring-1",
                )}
              >
                {selecting && (
                  <SelectBox
                    checked={selected.has(model.id)}
                    onChange={() => toggleOne(model.id)}
                    label={t("orders.selectNamed", { name: model.name })}
                  />
                )}
                {/* Vignette carrée : sans photo, une icône plutôt qu'un trou. */}
                <div className="bg-muted relative size-20 shrink-0 self-start overflow-hidden rounded-md">
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
                    {/* Un prix à 0 fausse le tableau de bord — location (bénéfice)
                        ou achat (chiffre d'affaires) : il doit se voir. */}
                    {model.price > 0 && model.purchasePrice > 0 ? (
                      <span className="tabular font-medium">{formatMoney(model.price, locale)}</span>
                    ) : (
                      <span className="bg-gold-soft text-foreground rounded px-1.5 py-0.5 text-xs font-medium">
                        {t("stock.priceMissing")}
                      </span>
                    )}
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
                <th scope="col" className={cn(sheet.th, "text-start", selecting && "ps-0")}>
                  <span className={sheet.thInner}>
                    {selecting && (
                      <SelectBox
                        checked={allSelected}
                        indeterminate={!allSelected}
                        onChange={toggleAll}
                        label={t("orders.selectAll")}
                      />
                    )}
                    {t("stock.short.ref")}
                  </span>
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
                    if ((e.target as HTMLElement).closest("a,button,label,input")) return;
                    router.push(`/stock/${model.id}`, { locale });
                  }}
                  aria-selected={canEdit ? selected.has(model.id) : undefined}
                  className={cn(sheet.row, holdable, selected.has(model.id) && "[&>td]:bg-gold-soft")}
                >
                  <td
                    className={cn(sheet.td, "text-start md:whitespace-nowrap", selecting && "ps-0")}
                  >
                    <div className="flex items-center">
                      {selecting && (
                        <SelectBox
                          checked={selected.has(model.id)}
                          onChange={() => toggleOne(model.id)}
                          label={t("orders.selectNamed", { name: model.name })}
                        />
                      )}
                      <Link href={`/stock/${model.id}`} className={sheet.rowLink}>
                        <bdi className="block min-w-14 wrap-anywhere">
                          <Highlight text={model.ref} />
                        </bdi>
                      </Link>
                    </div>
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
                    {model.price > 0 && model.purchasePrice > 0 ? (
                      formatNumber(model.price, locale)
                    ) : (
                      <span className="bg-gold-soft text-foreground rounded px-1.5 py-0.5 text-xs font-medium">
                        {t("stock.priceMissing")}
                      </span>
                    )}
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
        <>
          <StockModelMenu model={menu} archived={archived} onClose={() => setMenu(null)} />
          <ConfirmDialog
            open={confirmDelete}
            onOpenChange={setConfirmDelete}
            icon={<Trash2 className="size-4" />}
            title={t("stock.deleteManyTitle", {
              count: visible.length,
              n: formatNumber(visible.length, locale),
            })}
            description={t("stock.deleteManyBody", { names: deleteNames })}
            confirmLabel={t("common.delete")}
            onConfirm={async () => {
              const result = await removeModels(idsData());
              if (!result.ok) return result;
              clear();
              if (result.deleted) {
                toast.success(
                  t("stock.deletedManyToast", {
                    count: result.deleted,
                    n: formatNumber(result.deleted, locale),
                  }),
                );
              }
              if (result.retired) {
                toast.info(
                  t("stock.retiredManyToast", {
                    count: result.retired,
                    n: formatNumber(result.retired, locale),
                  }),
                );
              }
              return { ok: true };
            }}
          />
        </>
      )}
    </>
  );
}
