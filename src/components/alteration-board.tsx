"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CircleCheck, Printer, ScanLine, Scissors, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { QrScanSheet, type ScanOutcome } from "@/components/qr-scan-sheet";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { markAltered, markLabelsPrinted, undoAltered } from "@/lib/actions/alterations";
import { TicketActions } from "@/components/ticket-share";
import { alterationIdFrom } from "@/lib/alteration-url";
import { formatDate, formatNumber, formatTime } from "@/lib/format";
import { daysBetween, todayIso } from "@/lib/rental-range";
import { cn } from "@/lib/utils";
import type { Alteration } from "@/lib/queries/alterations";
import type { Locale } from "@/i18n/routing";

/**
 * Le gros bouton de l'atelier : la caméra s'ouvre, l'étiquette scannée marque
 * sa pièce TAILLÉE, le cadre accroche le QR puis le tiroir se referme — comme
 * le scanner de la vente. La liste derrière se met à jour.
 */
export function AlterationScanButton({ className }: { className?: string }) {
  const t = useTranslations("alterations");
  const tRoot = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function onScan(code: string): Promise<ScanOutcome> {
    const id = alterationIdFrom(code);
    if (!id) return { ok: false, message: t("scan.notALabel") };
    const result = await markAltered({ id, locale });
    if (!result.ok) return { ok: false, message: tRoot(result.error) };
    router.refresh();
    const values = { customer: result.customerName, piece: result.piece ?? "" };
    return {
      ok: true,
      message: result.alreadyDone ? t("scan.already", values) : t("scan.done", values),
    };
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className={cn("h-14 w-full gap-2 text-base", className)}
      >
        <ScanLine className="size-6" aria-hidden />
        {t("scan.button")}
      </Button>
      <QrScanSheet
        open={open}
        onOpenChange={setOpen}
        onScan={onScan}
        manualEntry={false}
        texts={{ title: t("scan.title"), hint: t("scan.hint") }}
      />
    </>
  );
}

/** Onglets « Chez le tailleur » / « Taillées » — des liens, l'état est dans l'URL. */
export function AlterationTabs({
  base,
  pending,
  done,
}: {
  base: string;
  pending: number;
  done: number | null;
}) {
  const t = useTranslations("alterations");
  const { locale } = useParams<{ locale: Locale }>();
  const pathname = usePathname();
  const tabs = [
    { href: base, label: t("tabs.pending"), count: pending as number | null },
    { href: `${base}/taillees`, label: t("tabs.done"), count: done },
  ];
  return (
    <nav aria-label={t("tabs.label")} className="flex gap-2">
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
            {count !== null && (
              <span className="tabular opacity-80">{formatNumber(count, locale)}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Les pièces, une carte chacune — pensée pour être lue d'un coup d'œil, au
 * pouce, par le tailleur : QUI, QUOI, QUELLE retouche, POUR QUAND.
 *
 * `staff` ajoute ce que le magasin seul voit : le lien vers la commande,
 * « étiquette pas encore imprimée », réimpression et annulation d'un scan.
 */
export function AlterationList({
  items,
  mode,
}: {
  items: Alteration[];
  mode: "tailor" | "staff";
}) {
  const t = useTranslations("alterations");
  const { locale } = useParams<{ locale: Locale }>();
  const router = useRouter();
  const [confirm, setConfirm] = useState<Alteration | null>(null);
  const [undo, setUndo] = useState<Alteration | null>(null);
  const today = todayIso();

  if (items.length === 0) return null;

  return (
    <>
      <ul className="space-y-2">
        {items.map((item) => {
          const done = item.status === "taillee";
          const left = daysBetween(today, item.event_date);
          const urgent = !done && left <= 2;
          // Le nom de la pièce seul : la référence ne sert à rien au tailleur.
          const piece = item.model_name ?? "";
          return (
            <li
              key={item.id}
              className={cn(
                "bg-card rounded-lg border p-3",
                urgent ? "border-warning" : "border-border",
              )}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    <bdi>{item.customer_name}</bdi>
                  </p>
                  <p className="text-muted-foreground truncate text-sm">
                    <bdi>{piece}</bdi>
                    {item.size && (
                      <>
                        {" · "}
                        <span className="text-foreground font-medium">
                          {t("size", { size: item.size })}
                        </span>
                      </>
                    )}
                  </p>
                </div>
                <span
                  className={cn(
                    "tabular shrink-0 rounded-full px-2 text-xs leading-6",
                    done
                      ? "bg-success-soft text-success-foreground"
                      : urgent
                        ? "bg-warning-soft text-warning-foreground font-medium"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {done
                    ? t("status.taillee")
                    : left < 0
                      ? t("eventPast")
                      : left === 0
                        ? t("eventToday")
                        : t("eventIn", { count: left })}
                </span>
              </div>

              <p className="bg-gold-soft/50 mt-2 flex items-start gap-2 rounded-md px-2.5 py-2 text-base">
                <Scissors className="text-gold-strong mt-1 size-4 shrink-0" aria-hidden />
                <bdi className="min-w-0 break-words">{item.note}</bdi>
              </p>

              <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span>{t("eventOn", { date: formatDate(item.event_date, locale) })}</span>
                {mode === "staff" && (
                  <Link
                    href={`/commandes/${item.order_id}`}
                    className="text-foreground underline underline-offset-2"
                  >
                    {t("orderNo", { no: item.order_no })}
                  </Link>
                )}
                {done && item.done_at && (
                  <span>
                    {t("doneOn", {
                      date: `${formatDate(item.done_at, locale)} ${formatTime(item.done_at, locale)}`,
                      name: item.done_by_name ?? "—",
                    })}
                  </span>
                )}
                {mode === "staff" && !done && !item.printed_at && (
                  <span className="bg-warning-soft text-warning-foreground rounded-full px-2 leading-5">
                    {t("notPrinted")}
                  </span>
                )}
              </div>

              <div className="mt-2 flex gap-2">
                {!done && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setConfirm(item)}
                    className="h-11 flex-1 gap-1.5"
                  >
                    <CircleCheck className="size-4" aria-hidden />
                    {t("markDone")}
                  </Button>
                )}
                {mode === "staff" && !done && (
                  <Button asChild variant="ghost" className="h-11 gap-1.5">
                    <Link href={`/imprimer/retouches?ids=${item.id}`}>
                      <Printer className="size-4" aria-hidden />
                      {t("reprint")}
                    </Link>
                  </Button>
                )}
                {mode === "staff" && done && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setUndo(item)}
                    className="text-muted-foreground h-11 gap-1.5"
                  >
                    <Undo2 className="size-4 rtl:-scale-x-100" aria-hidden />
                    {t("undo")}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={t("confirmTitle")}
        description={
          confirm
            ? t("confirmBody", { customer: confirm.customer_name, note: confirm.note })
            : undefined
        }
        confirmLabel={t("markDone")}
        onConfirm={async () => {
          if (!confirm) return;
          const result = await markAltered({ id: confirm.id, locale });
          if (!result.ok) return { ok: false, error: result.error };
          toast.success(
            t(result.alreadyDone ? "scan.already" : "scan.done", {
              customer: result.customerName,
              piece: result.piece ?? "",
            }),
          );
          router.refresh();
          return { ok: true };
        }}
      />

      <ConfirmDialog
        open={undo !== null}
        onOpenChange={(open) => !open && setUndo(null)}
        title={t("undoTitle")}
        description={
          undo ? t("undoBody", { customer: undo.customer_name, note: undo.note }) : undefined
        }
        confirmLabel={t("undo")}
        onConfirm={async () => {
          if (!undo) return;
          const result = await undoAltered({ id: undo.id, locale });
          if (result.ok) router.refresh();
          return result;
        }}
      />
    </>
  );
}

/**
 * La page ouverte par l'APPAREIL PHOTO du téléphone (le QR est une URL) : un
 * seul gros bouton. Ouvrir la page ne change rien — c'est le toucher qui
 * marque la pièce, jamais un simple chargement.
 */
export function MarkAlteredButton({ id, done }: { id: string; done: boolean }) {
  const t = useTranslations("alterations");
  const tRoot = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const router = useRouter();
  const [state, setState] = useState<"idle" | "sending" | "done">(done ? "done" : "idle");
  const [error, setError] = useState<string | null>(null);

  if (state === "done") {
    return (
      <p
        role="status"
        className="bg-success-soft text-success-foreground flex min-h-14 items-center justify-center gap-2 rounded-lg px-4 text-base font-medium"
      >
        <CircleCheck className="size-5" aria-hidden />
        {t("status.taillee")}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        disabled={state === "sending"}
        onClick={async () => {
          setState("sending");
          setError(null);
          const result = await markAltered({ id, locale });
          if (!result.ok) {
            setError(tRoot(result.error));
            setState("idle");
            return;
          }
          navigator.vibrate?.(60);
          setState("done");
          router.refresh();
        }}
        className="h-14 w-full gap-2 text-base"
      >
        <CircleCheck className="size-5" aria-hidden />
        {t("markDone")}
      </Button>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * « Partager / Imprimer » des étiquettes : au premier geste, elles sont
 * notées IMPRIMÉES — « Imprimer les nouvelles » ne les reprendra plus.
 */
export function AlterationLabelsActions({ ids }: { ids: string[] }) {
  const { locale } = useParams<{ locale: Locale }>();
  const [marked, setMarked] = useState(false);
  return (
    <TicketActions
      onUse={() => {
        if (marked || ids.length === 0) return;
        setMarked(true);
        void markLabelsPrinted({ ids, locale });
      }}
    />
  );
}
