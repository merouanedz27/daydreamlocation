"use client";

import { useMemo, useState, useTransition } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Sparkles, Undo2, WashingMachine } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { SelectBox } from "@/components/select-box";
import { backFromPressing, sendToPressing } from "@/lib/actions/pressing";
import { daysBetween, todayIso } from "@/lib/rental-range";
import { formatMoney, formatNumber } from "@/lib/format";
import { matchesSearch } from "@/lib/search";
import { cn } from "@/lib/utils";
import type { PressingUnit } from "@/lib/queries/stock";
import type { Locale } from "@/i18n/routing";

/**
 * L'écran Pressing : ce qui est parti au dégraissage, et de quoi y envoyer.
 *
 * Deux listes, deux sélections séparées : on ne mélange jamais « envoyer » et
 * « faire revenir » dans un même geste. Une pièce au pressing est grisée
 * « Au pressing » dans la saisie des commandes jusqu'à son retour.
 */
export function PressingBoard({
  units,
  rentedIds,
  q,
}: {
  units: PressingUnit[];
  /** Pièces sorties chez un client aujourd'hui : on prévient, sans interdire. */
  rentedIds: number[];
  q: string;
}) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const [isPending, startTransition] = useTransition();
  const [toBack, setToBack] = useState<Set<number>>(new Set());
  const [toSend, setToSend] = useState<Set<number>>(new Set());
  const [backOpen, setBackOpen] = useState(false);
  const [backIds, setBackIds] = useState<number[]>([]);
  const [cost, setCost] = useState("");
  const [costError, setCostError] = useState<string | null>(null);

  const rented = useMemo(() => new Set(rentedIds), [rentedIds]);
  const today = todayIso();

  const name = (u: PressingUnit) => (locale === "ar" && u.modelNameAr) || u.modelName;
  const match = (u: PressingUnit) => matchesSearch(q, u.ref, u.modelName, u.modelNameAr, u.size);

  const atPressing = units
    .filter((u) => u.status === "nettoyage" && match(u))
    .sort((a, b) => (a.since ?? "").localeCompare(b.since ?? ""));
  const available = units.filter((u) => u.status === "disponible" && match(u));

  // Les disponibles, rangées par modèle : on cherche « Tuxedo A », on trouve
  // ses tailles côte à côte.
  const groups = useMemo(() => {
    const map = new Map<string, PressingUnit[]>();
    for (const u of available) {
      const list = map.get(u.modelRef) ?? [];
      list.push(u);
      map.set(u.modelRef, list);
    }
    return [...map.values()];
  }, [available]);

  function toggle(set: Set<number>, setter: (s: Set<number>) => void, id: number) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  }

  function form(ids: number[]) {
    const data = new FormData();
    data.set("locale", locale);
    data.set("ids", ids.join(","));
    return data;
  }

  function send() {
    const ids = [...toSend];
    startTransition(async () => {
      const result = await sendToPressing(form(ids));
      if (!result.ok) {
        toast.error(t(result.error));
        return;
      }
      setToSend(new Set());
      toast.success(
        t("pressing.sentToast", { count: result.count, n: formatNumber(result.count, locale) }),
      );
    });
  }

  function openBack(ids: number[]) {
    setBackIds(ids);
    setCost("");
    setCostError(null);
    setBackOpen(true);
  }

  function confirmBack() {
    const data = form(backIds);
    data.set("cost", cost);
    startTransition(async () => {
      const result = await backFromPressing(data);
      if (!result.ok) {
        setCostError(result.error);
        return;
      }
      setBackOpen(false);
      setToBack(new Set());
      const amount = Number(cost) || 0;
      toast.success(
        t("pressing.backToast", { count: result.count, n: formatNumber(result.count, locale) }),
        amount > 0
          ? { description: t("pressing.fraisAdded", { amount: formatMoney(amount, locale) }) }
          : undefined,
      );
    });
  }

  const backRefs = units
    .filter((u) => backIds.includes(u.id))
    .map((u) => u.ref)
    .join(", ");

  return (
    <div className="space-y-8">
      {/* A. Ce qui est au pressing en ce moment. */}
      <section aria-labelledby="pressing-out">
        <h2 id="pressing-out" className="text-lg">
          {t("pressing.atPressing")}{" "}
          <span className="text-muted-foreground tabular text-base font-normal">
            ({formatNumber(atPressing.length, locale)})
          </span>
        </h2>

        {atPressing.length ? (
          <ul className="border-border bg-card mt-3 overflow-hidden rounded-lg border">
            {atPressing.map((u) => {
              const days = u.since ? daysBetween(todayIso(new Date(u.since)), today) : null;
              return (
                <li
                  key={u.id}
                  className={cn(
                    "border-border flex min-h-14 items-center gap-1 border-b pe-2 last:border-b-0",
                    toBack.has(u.id) && "bg-gold-soft/60",
                  )}
                >
                  <SelectBox
                    checked={toBack.has(u.id)}
                    onChange={() => toggle(toBack, setToBack, u.id)}
                    label={t("orders.selectNamed", { name: u.ref })}
                  />
                  <div className="min-w-0 flex-1 py-2">
                    <p className="truncate text-sm font-medium">
                      {u.part && <span className="me-1.5">{t(`stock.parts.${u.part}`)}</span>}
                      <bdi>{u.ref}</bdi>
                      {u.size && (
                        <span className="text-muted-foreground tabular font-normal">
                          {" · "}
                          {u.size}
                        </span>
                      )}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                      {name(u)}
                      {days !== null && (
                        <>
                          {" · "}
                          {t("pressing.since", { count: days, n: formatNumber(days, locale) })}
                        </>
                      )}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 shrink-0"
                    disabled={isPending}
                    onClick={() => openBack([u.id])}
                  >
                    <Undo2 className="size-4" aria-hidden />
                    {t("pressing.backOne")}
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="border-border mt-3 flex flex-col items-center rounded-lg border border-dashed px-6 py-8 text-center">
            <Sparkles className="text-muted-foreground size-7" aria-hidden />
            <p className="text-muted-foreground mt-3 text-sm">
              {q ? t("search.noMatch", { q }) : t("pressing.none")}
            </p>
          </div>
        )}
      </section>

      {/* B. Envoyer des pièces disponibles au pressing. */}
      <section aria-labelledby="pressing-send">
        <h2 id="pressing-send" className="text-lg">
          {t("pressing.sendTitle")}
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">{t("pressing.sendHint")}</p>

        {groups.length ? (
          <div className="mt-3 space-y-3">
            {groups.map((list) => (
              <div key={list[0].modelRef} className="border-border bg-card overflow-hidden rounded-lg border">
                <p className="bg-muted/50 border-border truncate border-b px-3 py-2 text-sm font-medium">
                  {name(list[0])}{" "}
                  <span className="text-muted-foreground font-normal">
                    <bdi>{list[0].modelRef}</bdi>
                  </span>
                </p>
                <ul>
                  {list.map((u) => (
                    <li
                      key={u.id}
                      className={cn(
                        "border-border flex min-h-12 items-center gap-1 border-b pe-3 last:border-b-0",
                        toSend.has(u.id) && "bg-gold-soft/60",
                      )}
                    >
                      <SelectBox
                        checked={toSend.has(u.id)}
                        onChange={() => toggle(toSend, setToSend, u.id)}
                        label={t("orders.selectNamed", { name: u.ref })}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {u.part && <span className="me-1.5">{t(`stock.parts.${u.part}`)}</span>}
                        <bdi>{u.ref}</bdi>
                      </span>
                      {rented.has(u.id) && (
                        <span className="bg-gold-soft text-foreground shrink-0 rounded px-1.5 py-0.5 text-xs">
                          {t("pressing.rentedNow")}
                        </span>
                      )}
                      {u.size && (
                        <span className="tabular text-muted-foreground w-12 shrink-0 text-end text-sm">
                          {u.size}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground mt-3 text-sm">
            {q ? t("search.noMatch", { q }) : t("pressing.nothingToSend")}
          </p>
        )}
      </section>

      {/* Barre d'action collante : elle n'apparaît qu'avec une sélection. */}
      {(toSend.size > 0 || toBack.size > 0) && (
        <div className="bg-background border-border pb-safe sticky bottom-0 -mx-4 flex flex-col gap-2 border-t px-4 py-3">
          {toBack.size > 0 && (
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full text-base"
              disabled={isPending}
              onClick={() => openBack([...toBack])}
            >
              <Undo2 className="size-4" aria-hidden />
              {t("pressing.back", { count: toBack.size, n: formatNumber(toBack.size, locale) })}
            </Button>
          )}
          {toSend.size > 0 && (
            <Button
              type="button"
              className="h-12 w-full text-base"
              disabled={isPending}
              onClick={send}
            >
              {isPending ? <Spinner /> : <WashingMachine className="size-4" aria-hidden />}
              {t("pressing.send", { count: toSend.size, n: formatNumber(toSend.size, locale) })}
            </Button>
          )}
        </div>
      )}

      {/* Le retour : un seul tiroir, avec le prix du pressing facultatif. */}
      <Drawer open={backOpen} onOpenChange={(open) => !isPending && setBackOpen(open)}>
        <DrawerContent>
          <DrawerHeader className="text-start">
            <DrawerTitle>
              {t("pressing.backTitle", {
                count: backIds.length,
                n: formatNumber(backIds.length, locale),
              })}
            </DrawerTitle>
            <DrawerDescription>
              <bdi>{backRefs}</bdi>
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4">
            <Field data-invalid={costError ? true : undefined}>
              <FieldLabel htmlFor="pressing-cost">{t("pressing.costLabel")}</FieldLabel>
              <Input
                id="pressing-cost"
                type="number"
                inputMode="numeric"
                min={0}
                step={100}
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                disabled={isPending}
                className="h-12 text-base"
              />
              <FieldDescription>{t("pressing.costHint")}</FieldDescription>
              {costError && (
                <p className="text-destructive text-sm" role="alert">
                  {t(costError)}
                </p>
              )}
            </Field>
          </div>
          <DrawerFooter>
            <Button
              type="button"
              className="h-12 w-full text-base"
              disabled={isPending}
              onClick={confirmBack}
            >
              {isPending && <Spinner />}
              {t("pressing.backConfirm")}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
