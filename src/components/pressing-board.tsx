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
import { Link, usePathname } from "@/i18n/navigation";
import { backFromPressing, sendToPressing } from "@/lib/actions/pressing";
import { daysBetween, todayIso } from "@/lib/rental-range";
import { formatMoney, formatNumber } from "@/lib/format";
import { matchesSearch } from "@/lib/search";
import { cn } from "@/lib/utils";
import type { PressingUnit } from "@/lib/queries/stock";
import type { Locale } from "@/i18n/routing";

/*
 * L'écran Pressing, en deux pages : « À envoyer » (/pressing) et « Au
 * pressing » (/pressing/en-cours). Deux pages, deux sélections : on ne
 * mélange jamais « envoyer » et « faire revenir » dans un même geste. Une
 * pièce au pressing est grisée « Au pressing » dans la saisie des commandes
 * jusqu'à son retour.
 */

/**
 * Barre d'action collante, JUSTE AU-DESSUS de la barre d'onglets basse
 * (`bottom-above-nav`) — collée à `bottom-0`, elle passait dessous et cachait
 * « Envoyer ».
 */
const ACTION_BAR =
  "bg-background border-border bottom-above-nav sticky z-30 -mx-4 flex flex-col gap-2 border-t px-4 py-3 md:bottom-0";

/** Les deux onglets, avec leur nombre de pièces. */
export function PressingTabs({ toSend, out }: { toSend: number; out: number }) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const pathname = usePathname();

  const tabs = [
    { href: "/pressing", label: t("pressing.tabSend"), count: toSend },
    { href: "/pressing/en-cours", label: t("pressing.tabOut"), count: out },
  ];

  return (
    <nav aria-label={t("pressing.tabs")} className="flex gap-2">
      {tabs.map(({ href, label, count }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            replace
            aria-current={active ? "page" : undefined}
            className={cn(
              "press flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full border px-4 text-sm whitespace-nowrap",
              active
                ? "border-primary bg-primary text-primary-foreground font-medium"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {label}
            <span className="tabular opacity-80">{formatNumber(count, locale)}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function useToggleSet() {
  const [set, setSet] = useState<Set<number>>(new Set());
  const toggle = (id: number) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSet(next);
  };
  return [set, toggle, () => setSet(new Set())] as const;
}

function form(locale: Locale, ids: number[]) {
  const data = new FormData();
  data.set("locale", locale);
  data.set("ids", ids.join(","));
  return data;
}

function useName() {
  const { locale } = useParams<{ locale: Locale }>();
  return (u: PressingUnit) => (locale === "ar" && u.modelNameAr) || u.modelName;
}

/** « À envoyer » : les pièces disponibles, rangées par modèle. */
export function PressingSend({
  units,
  rentedIds,
  q,
}: {
  /** Les pièces DISPONIBLES, déjà filtrées par catégorie. */
  units: PressingUnit[];
  /** Pièces sorties chez un client aujourd'hui : on prévient, sans interdire. */
  rentedIds: number[];
  q: string;
}) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const name = useName();
  const [isPending, startTransition] = useTransition();
  const [toSend, toggle, clear] = useToggleSet();

  const rented = useMemo(() => new Set(rentedIds), [rentedIds]);

  // Rangées par modèle : on cherche « Tuxedo A », on trouve ses tailles côte
  // à côte.
  const groups = useMemo(() => {
    const map = new Map<string, PressingUnit[]>();
    for (const u of units) {
      if (!matchesSearch(q, u.ref, u.modelName, u.modelNameAr, u.size)) continue;
      const list = map.get(u.modelRef) ?? [];
      list.push(u);
      map.set(u.modelRef, list);
    }
    return [...map.values()];
  }, [units, q]);

  function send() {
    const ids = [...toSend];
    startTransition(async () => {
      const result = await sendToPressing(form(locale, ids));
      if (!result.ok) {
        toast.error(t(result.error));
        return;
      }
      clear();
      toast.success(
        t("pressing.sentToast", { count: result.count, n: formatNumber(result.count, locale) }),
      );
    });
  }

  return (
    <section aria-labelledby="pressing-send">
      <h2 id="pressing-send" className="sr-only">
        {t("pressing.sendTitle")}
      </h2>
      <p className="text-muted-foreground text-sm">{t("pressing.sendHint")}</p>

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
                      onChange={() => toggle(u.id)}
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

      {toSend.size > 0 && (
        <div className={cn(ACTION_BAR, "mt-6")}>
          <Button type="button" className="h-12 w-full text-base" disabled={isPending} onClick={send}>
            {isPending ? <Spinner /> : <WashingMachine className="size-4" aria-hidden />}
            {t("pressing.send", { count: toSend.size, n: formatNumber(toSend.size, locale) })}
          </Button>
        </div>
      )}
    </section>
  );
}

/** « Au pressing » : ce qui y est parti, le plus ancien d'abord. */
export function PressingBack({ units, q }: { units: PressingUnit[]; q: string }) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const name = useName();
  const [isPending, startTransition] = useTransition();
  const [toBack, toggle, clear] = useToggleSet();
  const [backOpen, setBackOpen] = useState(false);
  const [backIds, setBackIds] = useState<number[]>([]);
  const [cost, setCost] = useState("");
  const [costError, setCostError] = useState<string | null>(null);

  const today = todayIso();
  const atPressing = units
    .filter((u) => matchesSearch(q, u.ref, u.modelName, u.modelNameAr, u.size))
    .sort((a, b) => (a.since ?? "").localeCompare(b.since ?? ""));

  function openBack(ids: number[]) {
    setBackIds(ids);
    setCost("");
    setCostError(null);
    setBackOpen(true);
  }

  function confirmBack() {
    const data = form(locale, backIds);
    data.set("cost", cost);
    startTransition(async () => {
      const result = await backFromPressing(data);
      if (!result.ok) {
        setCostError(result.error);
        return;
      }
      setBackOpen(false);
      clear();
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
    <section aria-labelledby="pressing-out">
      <h2 id="pressing-out" className="sr-only">
        {t("pressing.atPressing")}
      </h2>
      <p className="text-muted-foreground text-sm">{t("pressing.outHint")}</p>

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
                  onChange={() => toggle(u.id)}
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

      {toBack.size > 0 && (
        <div className={cn(ACTION_BAR, "mt-6")}>
          <Button
            type="button"
            className="h-12 w-full text-base"
            disabled={isPending}
            onClick={() => openBack([...toBack])}
          >
            <Undo2 className="size-4" aria-hidden />
            {t("pressing.back", { count: toBack.size, n: formatNumber(toBack.size, locale) })}
          </Button>
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
            <Button type="button" className="h-12 w-full text-base" disabled={isPending} onClick={confirmBack}>
              {isPending && <Spinner />}
              {t("pressing.backConfirm")}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </section>
  );
}
