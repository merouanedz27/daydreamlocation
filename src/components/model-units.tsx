"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronDown, Minus, Plus, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SelectBox } from "@/components/select-box";
import { ModelPieces } from "@/components/model-pieces";
import { UnitEdit } from "@/components/unit-edit";
import { useOnline } from "@/components/offline-sync";
import { Link } from "@/i18n/navigation";
import { addUnitsOfSize, deleteUnits, removeUnitOfSize } from "@/lib/actions/stock";
import { sortSizes } from "@/lib/sizes";
import { useHold } from "@/lib/use-hold";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Part } from "@/lib/stock-refs";
import type { Locale } from "@/i18n/routing";

/** Une pièce réelle, prête à afficher : tout est calculé côté serveur. */
export type ModelUnitRow = {
  id: number;
  ref: string;
  part: string | null;
  size: string | null;
  length_cm: number | null;
  price_override: number | null;
  status: string;
  /** Louable aujourd'hui : bon état ET aucune commande ne la retient. */
  free: boolean;
};

/**
 * Un article de la fiche : une pièce simple, ou un COSTUME (ses parties). Les
 * pièces retirées n'y figurent pas — elles ne sont plus au stock.
 */
export type ModelItem = {
  key: string;
  ref: string;
  setRef: string | null;
  /** Taille de la pièce, ou de la veste du costume ; "" = sans taille. */
  size: string;
  free: boolean;
  units: ModelUnitRow[];
};

const UNIT_STATUS_KEY: Record<string, string> = {
  disponible: "available",
  nettoyage: "cleaning",
  reparation: "repair",
  retire: "retired",
};

/** Combien de références la confirmation nomme avant « … ». */
const NAMES_SHOWN = 5;

/**
 * Les pièces d'un modèle, RANGÉES PAR TAILLE : une ligne « 50 · 3 libres
 * − 4 + ». C'est ainsi que le client pense son stock (« j'ai quatre vestes en
 * 50 ») ; chaque pièce reste un vêtement réel, avec sa référence — la
 * disponibilité se calcule à la pièce.
 *
 *   - − / + : une pièce de moins, une de plus dans cette taille ;
 *   - toucher une taille : ses pièces s'affichent ; toucher une pièce : on la
 *     corrige (taille, longueur, prix) ;
 *   - appui long sur une pièce (ou un costume) : elle se sélectionne, et
 *     « Supprimer » efface la sélection après confirmation.
 */
export function ModelUnits({
  modelId,
  refCode,
  categorySlug,
  parts,
  items,
  existingRefs,
  canEdit,
}: {
  modelId: number;
  refCode: string;
  categorySlug: string | null;
  /** Costume divisible : chaque article est un costume de ces parties. */
  parts: readonly Part[];
  items: ModelItem[];
  /** Toutes les références du modèle, retirées comprises (aperçu des suivantes). */
  existingRefs: string[];
  /** Gestionnaire du stock : − / +, appui long, correction. */
  canEdit: boolean;
}) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const online = useOnline();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [editing, setEditing] = useState<ModelUnitRow | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [adding, setAdding] = useState(0);
  const [, startTransition] = useTransition();

  // Le nombre par taille bouge AU TOUCHER ; la base confirme ensuite.
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.size, (counts.get(item.size) ?? 0) + 1);
  const [shown, shift] = useOptimistic(
    counts,
    (current, { size, delta }: { size: string; delta: number }) => {
      const next = new Map(current);
      next.set(size, Math.max((next.get(size) ?? 0) + delta, 0));
      return next;
    },
  );

  const sizes = [...sortSizes(items.map((i) => i.size)), ...(counts.has("") ? [""] : [])];
  const bySize = (size: string) => items.filter((i) => i.size === size);

  // Un article supprimé entre-temps ne reste pas « sélectionné » en douce.
  const chosen = items.filter((i) => selected.has(i.key));
  const selecting = chosen.length > 0;

  function toggle(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  const clear = () => setSelected(new Set());
  const hold = useHold<ModelItem>(canEdit, selecting, (item) => toggle(item.key));

  function step(size: string, delta: 1 | -1) {
    startTransition(async () => {
      shift({ size, delta });
      const data = new FormData();
      data.set("locale", locale);
      data.set("model_id", String(modelId));
      data.set("size", size);
      const result = await (delta > 0 ? addUnitsOfSize(data) : removeUnitOfSize(data));
      if (!result.ok) {
        toast.error(t(result.error));
        return;
      }
      if ("retired" in result && result.retired) toast.success(t("stock.oneRetiredToast"));
    });
  }

  function openEdit(unit: ModelUnitRow) {
    setEditing(unit);
    setEditOpen(true);
  }

  async function onDelete() {
    const data = new FormData();
    data.set("locale", locale);
    data.set("model_id", String(modelId));
    data.set(
      "ids",
      chosen
        .filter((i) => !i.setRef)
        .map((i) => i.units[0].id)
        .join(","),
    );
    data.set(
      "set_refs",
      chosen
        .filter((i) => i.setRef)
        .map((i) => i.setRef)
        .join(","),
    );
    const result = await deleteUnits(data);
    if (!result.ok) return result;
    const summary = [
      result.deleted && t("stock.deletedPart", { count: result.deleted, n: formatNumber(result.deleted, locale) }),
      result.retired && t("stock.retiredPart", { count: result.retired, n: formatNumber(result.retired, locale) }),
      result.kept && t("stock.keptPart", { count: result.kept, n: formatNumber(result.kept, locale) }),
    ]
      .filter(Boolean)
      .join(" · ");
    if (result.kept && !result.deleted && !result.retired) toast.warning(summary);
    else toast.success(summary);
    clear();
    return result;
  }

  const total = items.length;
  const freeCount = items.filter((i) => i.free).length;
  const isSets = parts.length > 0;
  // Pas de loupe ni de menu « copier » d'iOS sous le doigt qui appuie.
  const holdable = canEdit && "select-none [-webkit-touch-callout:none]";
  const names =
    chosen
      .slice(0, NAMES_SHOWN)
      .map((i) => i.ref)
      .join(", ") + (chosen.length > NAMES_SHOWN ? "…" : "");

  const badge = (free: boolean, status: string) => (
    <Badge
      className={cn(
        "border-transparent",
        free
          ? "bg-success-soft text-success-foreground"
          : status === "disponible"
            ? "bg-gold-soft text-foreground"
            : "bg-muted text-muted-foreground",
      )}
    >
      {free
        ? t("stock.available")
        : status === "disponible"
          ? t("stock.reserved")
          : t(`stock.${UNIT_STATUS_KEY[status] ?? "available"}`)}
    </Badge>
  );

  /** Une pièce dans la liste dépliée : sa référence et son état, rien d'autre. */
  const unitLine = (unit: ModelUnitRow, nested: boolean) => (
    <button
      type="button"
      disabled={!canEdit}
      // En sélection, le toucher coche la ligne (`useHold`), il n'ouvre rien.
      onClick={() => !selecting && openEdit(unit)}
      className={cn(
        "flex min-h-11 min-w-0 flex-1 items-center gap-2 py-2 text-start disabled:opacity-100",
        nested && "ps-3",
      )}
    >
      <span className="min-w-0 flex-1 truncate text-sm">
        {unit.part && <span className="me-1.5 font-medium">{t(`stock.parts.${unit.part}`)}</span>}
        <bdi className={cn(unit.part ? "text-muted-foreground" : "font-medium")}>{unit.ref}</bdi>
        {unit.part && unit.size && <span className="tabular text-muted-foreground"> · {unit.size}</span>}
      </span>
      {badge(unit.free, unit.status)}
    </button>
  );

  return (
    <>
      {selecting ? (
        // La barre de la sélection prend la place du titre, sous le pouce.
        <div
          role="toolbar"
          aria-label={t("stock.piecesSelected", {
            count: chosen.length,
            n: formatNumber(chosen.length, locale),
          })}
          className="bg-gold-soft flex items-center gap-1.5 rounded-lg p-1.5"
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
          <span className="me-auto text-sm font-medium">
            {t("stock.piecesSelected", {
              count: chosen.length,
              n: formatNumber(chosen.length, locale),
            })}
          </span>
          <Button
            type="button"
            variant="destructive"
            disabled={!online}
            onClick={() => setConfirmDelete(true)}
            className="h-11"
          >
            <Trash2 className="size-4" aria-hidden />
            {t("common.delete")}
          </Button>
        </div>
      ) : (
        <div className="flex min-h-14 items-center justify-between gap-4">
          <div>
            <h2 className="text-lg">
              {isSets ? t("stock.parts.costumes") : t("stock.pieces")}{" "}
              <span className="text-muted-foreground tabular text-base font-normal">({total})</span>
            </h2>
            <p className="text-muted-foreground text-sm">
              {isSets
                ? t("stock.parts.completeFree", { count: freeCount, n: String(freeCount) })
                : t("stock.freeToday", { count: freeCount, n: String(freeCount) })}
            </p>
          </div>
          {canEdit && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!online}
              onClick={() => setAdding((n) => n + 1)}
              className="h-11"
            >
              <Plus className="size-4" aria-hidden />
              {t("stock.addSizeOpen")}
            </Button>
          )}
        </div>
      )}

      {sizes.length === 0 ? (
        <p className="text-muted-foreground border-border mt-4 rounded-lg border border-dashed p-4 text-center text-sm">
          {t("stock.noPiecesYet")}
        </p>
      ) : (
        <ul className="border-border bg-card divide-border mt-4 divide-y rounded-lg border">
          {sizes.map((size) => {
            const group = bySize(size);
            const count = shown.get(size) ?? 0;
            const free = group.filter((i) => i.free).length;
            const isOpen = expanded.has(size) || selecting;
            const label = size || t("stock.noSize");
            return (
              <li key={size || "-"}>
                <div className="flex items-center gap-1 py-1 ps-1 pe-1">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() =>
                      setExpanded((current) => {
                        const next = new Set(current);
                        if (next.has(size)) next.delete(size);
                        else next.add(size);
                        return next;
                      })
                    }
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-md px-2 text-start"
                  >
                    <ChevronDown
                      className={cn(
                        "text-muted-foreground size-4 shrink-0 transition-transform",
                        isOpen && "rotate-180",
                      )}
                      aria-hidden
                    />
                    <span className="tabular min-w-10 text-lg font-medium">
                      <bdi>{label}</bdi>
                    </span>
                    <span
                      className={cn(
                        "truncate text-sm",
                        free ? "text-success-foreground" : "text-muted-foreground",
                      )}
                    >
                      {t("stock.sizeFree", { count: free, n: formatNumber(free, locale) })}
                    </span>
                  </button>

                  {canEdit ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-11"
                        disabled={!online || count === 0}
                        onClick={() => step(size, -1)}
                        aria-label={t("stock.decreaseFor", { size: label })}
                      >
                        <Minus className="size-4" aria-hidden />
                      </Button>
                      <span
                        className="tabular w-8 text-center text-lg font-medium"
                        aria-live="polite"
                        aria-label={t("stock.quantityFor", { size: label, count: String(count) })}
                      >
                        {count}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-11"
                        disabled={!online || count >= 50}
                        onClick={() => step(size, 1)}
                        aria-label={t("stock.increaseFor", { size: label })}
                      >
                        <Plus className="size-4" aria-hidden />
                      </Button>
                    </div>
                  ) : (
                    <span className="tabular w-10 shrink-0 text-center text-lg font-medium">
                      {count}
                    </span>
                  )}
                </div>

                {isOpen && group.length > 0 && (
                  <ul className="border-border bg-muted/40 divide-border divide-y border-t">
                    {group.map((item) => {
                      const on = selected.has(item.key);
                      return (
                        <li
                          key={item.key}
                          {...hold(item)}
                          className={cn(
                            "ps-3 pe-3",
                            holdable,
                            selecting && "ps-0",
                            on && "bg-gold-soft",
                          )}
                        >
                          {item.setRef ? (
                            <>
                              <div className="flex min-h-11 items-center gap-2">
                                {selecting && (
                                  <SelectBox
                                    checked={on}
                                    onChange={() => toggle(item.key)}
                                    label={t("orders.selectNamed", { name: item.ref })}
                                  />
                                )}
                                <p className="min-w-0 flex-1 truncate py-2 text-sm font-semibold">
                                  <bdi>{item.setRef}</bdi>
                                </p>
                                {badge(
                                  item.free,
                                  item.units.find((u) => u.status !== "disponible")?.status ??
                                    "disponible",
                                )}
                              </div>
                              <ul className="pb-1">
                                {item.units.map((unit) => (
                                  <li key={unit.id} className={cn("flex", selecting && "ps-11")}>
                                    {unitLine(unit, true)}
                                  </li>
                                ))}
                              </ul>
                            </>
                          ) : (
                            <div className="flex items-center gap-2">
                              {selecting && (
                                <SelectBox
                                  checked={on}
                                  onChange={() => toggle(item.key)}
                                  label={t("orders.selectNamed", { name: item.ref })}
                                />
                              )}
                              {unitLine(item.units[0], false)}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit && sizes.length > 0 && !selecting && (
        <p className="text-muted-foreground mt-2 text-xs">{t("stock.holdHint")}</p>
      )}

      {editing && (
        <UnitEdit
          key={editing.id}
          unit={{
            id: editing.id,
            ref_code: editing.ref,
            size: editing.size,
            length_cm: editing.length_cm,
            price_override: editing.price_override,
          }}
          categorySlug={editing.part ?? categorySlug}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        icon={<Trash2 className="size-4" />}
        title={t("stock.deleteSelectedTitle", {
          count: chosen.length,
          n: formatNumber(chosen.length, locale),
        })}
        description={
          <>
            <bdi className="text-foreground font-medium">{names}</bdi>
            <br />
            {t("stock.deleteSelectedBody")}
          </>
        }
        confirmLabel={t("common.delete")}
        onConfirm={onDelete}
      />

      {canEdit && (
        <AddSizes
          key={adding}
          open={adding > 0}
          onClose={() => setAdding(0)}
          modelId={modelId}
          refCode={refCode}
          categorySlug={categorySlug}
          parts={parts}
          existingRefs={existingRefs}
          existingSizes={sizes}
        />
      )}
    </>
  );
}

/**
 * « Ajouter une taille » : une taille qui n'est pas encore au stock, avec son
 * nombre (« 54 × 2 »). Les tailles déjà là ont leur − / + sur la fiche.
 */
function AddSizes({
  open,
  onClose,
  modelId,
  refCode,
  categorySlug,
  parts,
  existingRefs,
  existingSizes,
}: {
  open: boolean;
  onClose: () => void;
  modelId: number;
  refCode: string;
  categorySlug: string | null;
  parts: readonly Part[];
  existingRefs: string[];
  existingSizes: string[];
}) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    // « 50:3 » → trois pièces en 50 ; le séparateur est le DERNIER « : ».
    const rows = formData.getAll("pieces").map((value) => {
      const row = String(value);
      const at = row.lastIndexOf(":");
      return { size: row.slice(0, at), count: Number(row.slice(at + 1)) };
    });
    startTransition(async () => {
      for (const { size, count } of rows) {
        const data = new FormData();
        data.set("locale", locale);
        data.set("model_id", String(modelId));
        data.set("size", size);
        data.set("count", String(count));
        const result = await addUnitsOfSize(data);
        if (!result.ok) {
          setError(result.error);
          return;
        }
      }
      toast.success(t("stock.piecesAddedToast", { count: total, n: formatNumber(total, locale) }));
      onClose();
    });
  }

  return (
    <Drawer open={open} onOpenChange={(next) => !next && !isPending && onClose()}>
      <DrawerContent className="max-h-[92svh]">
        <DrawerHeader className="text-start">
          <DrawerTitle>{t("stock.addSizeTitle")}</DrawerTitle>
          <DrawerDescription>{t("stock.addSizeHint")}</DrawerDescription>
        </DrawerHeader>

        <form action={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="overflow-y-auto px-4">
            <ModelPieces
              categorySlug={categorySlug}
              refCode={refCode}
              parts={parts}
              existingRefs={existingRefs}
              excludeSizes={existingSizes}
              onTotalChange={setTotal}
              disabled={isPending}
            />
            {error && (
              <p className="text-destructive mt-3 text-sm" role="alert">
                {t(error)}
              </p>
            )}
          </div>

          <DrawerFooter>
            <Button type="submit" disabled={isPending || total === 0} className="h-12 w-full text-base">
              {isPending && <Spinner />}
              {t("stock.addPiecesSubmit", { count: total, n: formatNumber(total, locale) })}
            </Button>
            <Button asChild variant="ghost" className="h-12 w-full text-base">
              <Link href={`/stock/${modelId}/piece`}>{t("stock.moreOptions")}</Link>
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
