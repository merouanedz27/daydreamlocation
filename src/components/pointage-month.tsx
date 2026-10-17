"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PointageShiftForm } from "@/components/pointage-shift-form";
import { ShiftLine, useNow } from "@/components/pointage-clock";
import { sheet } from "@/components/sheet-table";
import { deleteShift } from "@/lib/actions/pointage";
import {
  formatDayMonth,
  formatDuration,
  formatMonthYear,
  formatTime,
  formatWeekdayShort,
} from "@/lib/format";
import {
  addMonths,
  closedMinutes,
  currentMonth,
  monthDate,
  summarize,
  type Month,
  type Shift,
} from "@/lib/pointage";
import type { PointageMember } from "@/lib/queries/pointage";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/routing";

/**
 * Le mois de l'équipe : jours pointés et heures, une ligne par personne. Les
 * heures ne comptent que les périodes CLOSES ; une période restée ouverte est
 * signalée à part (« 1 non clôturé ») pour que le propriétaire la corrige.
 *
 * Toucher une ligne ouvre le détail de la personne, jour par jour, avec la
 * correction et la suppression. Trois colonnes : le tableau tient à 390 px
 * sans défiler (`sheet-table`).
 */
export function PointageMonth({
  month,
  today,
  members,
  shifts,
}: {
  month: Month;
  today: string;
  members: PointageMember[];
  shifts: Shift[];
}) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const now = useNow();
  const summary = summarize(shifts);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Shift | null>(null);
  const [formUserId, setFormUserId] = useState("");
  const [deleting, setDeleting] = useState<Shift | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Les membres actifs, plus ceux qui ont pointé ce mois avant d'être désactivés.
  const rows = members.filter((m) => m.is_active || summary.has(m.id));
  const team = [...summary.values()].reduce(
    (acc, r) => ({ minutes: acc.minutes + r.minutes, open: acc.open + r.open }),
    { minutes: 0, open: 0 },
  );
  const detail = members.find((m) => m.id === detailId) ?? null;
  const detailShifts = shifts.filter((s) => s.user_id === detailId);
  const byDay = new Map<string, Shift[]>();
  for (const s of detailShifts) byDay.set(s.work_date, [...(byDay.get(s.work_date) ?? []), s]);
  const days = [...byDay.entries()].sort(([a], [b]) => b.localeCompare(a));

  const label = formatMonthYear(monthDate(month), locale);
  const isCurrent = month >= currentMonth();
  // Un ajout se date dans le mois affiché : aujourd'hui s'il en fait partie.
  const defaultDate = today.startsWith(month) ? today : `${month}-01`;

  function openForm(shift: Shift | null, userId: string) {
    setEditing(shift);
    setFormUserId(userId);
    setFormOpen(true);
  }

  async function onDelete() {
    if (!deleting) return;
    const data = new FormData();
    data.set("locale", locale);
    data.set("id", String(deleting.id));
    const result = await deleteShift(data);
    if (result.ok) toast.success(t("pointage.deleted"));
    return result;
  }

  return (
    <section aria-labelledby="pointage-month">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="icon" className="size-11" asChild>
          <Link href={`/pointage?onglet=mois&mois=${addMonths(month, -1)}`}>
            <ChevronLeft className="size-5 rtl:-scale-x-100" aria-hidden />
            <span className="sr-only">{t("pointage.monthPrev")}</span>
          </Link>
        </Button>
        <h2 id="pointage-month" className="text-base font-medium">
          {label}
        </h2>
        {isCurrent ? (
          <span className="size-11" aria-hidden />
        ) : (
          <Button variant="ghost" size="icon" className="size-11" asChild>
            <Link href={`/pointage?onglet=mois&mois=${addMonths(month, 1)}`}>
              <ChevronRight className="size-5 rtl:-scale-x-100" aria-hidden />
              <span className="sr-only">{t("pointage.monthNext")}</span>
            </Link>
          </Button>
        )}
      </div>

      <Button
        type="button"
        variant="outline"
        className="mt-3 h-12 w-full text-base"
        onClick={() => openForm(null, rows[0]?.id ?? "")}
      >
        <Plus className="size-4" aria-hidden />
        {t("pointage.add")}
      </Button>

      {rows.length === 0 || summary.size === 0 ? (
        <p className="text-muted-foreground border-border mt-3 rounded-lg border border-dashed py-8 text-center text-sm">
          {t("pointage.monthEmpty")}
        </p>
      ) : (
        <div className={cn(sheet.wrapper, "mt-3")}>
          <table className={sheet.table}>
            <thead>
              <tr className={sheet.headRow}>
                <th scope="col" className={cn(sheet.th, "text-start")}>
                  <span className={sheet.thInner}>{t("pointage.head.member")}</span>
                </th>
                <th scope="col" className={cn(sheet.th, "w-px text-end")}>
                  <span className={cn(sheet.thInner, "justify-end")}>{t("pointage.head.days")}</span>
                </th>
                <th scope="col" className={cn(sheet.th, "w-px text-end")}>
                  <span className={cn(sheet.thInner, "justify-end")}>{t("pointage.head.hours")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((member) => {
                const r = summary.get(member.id) ?? { days: 0, minutes: 0, open: 0 };
                return (
                  <tr
                    key={member.id}
                    className={sheet.row}
                    onClick={() => {
                      setDetailId(member.id);
                      setDetailOpen(true);
                    }}
                  >
                    <td className={cn(sheet.td, "text-start")}>
                      <button
                        type="button"
                        className={cn(sheet.rowLink, "text-start font-medium")}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDetailId(member.id);
                          setDetailOpen(true);
                        }}
                      >
                        {member.full_name}
                      </button>
                      {r.open > 0 && (
                        <span className="bg-warning-soft text-warning-foreground ms-1.5 inline-block rounded-full px-1.5 text-[11px] leading-5">
                          {t("pointage.openCount", { count: r.open })}
                        </span>
                      )}
                    </td>
                    <td className={cn(sheet.td, "tabular text-end whitespace-nowrap")}>{r.days}</td>
                    <td className={cn(sheet.td, "tabular text-end font-medium whitespace-nowrap")}>
                      {formatDuration(r.minutes, locale)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-border bg-muted/60 border-t">
                <th scope="row" className={cn(sheet.td, "text-start font-medium")} colSpan={2}>
                  {t("pointage.teamTotal")}
                </th>
                <td className={cn(sheet.td, "tabular text-end font-medium whitespace-nowrap")}>
                  {formatDuration(team.minutes, locale)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* --- Détail d'une personne ------------------------------------------ */}
      <Drawer open={detailOpen} onOpenChange={setDetailOpen}>
        <DrawerContent className="max-h-[92svh]">
          <DrawerHeader className="text-start">
            <DrawerTitle>{detail?.full_name}</DrawerTitle>
            <DrawerDescription>
              {label} ·{" "}
              {t("pointage.detailHint", {
                days: t("pointage.days", { count: summary.get(detailId ?? "")?.days ?? 0 }),
                hours: formatDuration(summary.get(detailId ?? "")?.minutes ?? 0, locale),
              })}
            </DrawerDescription>
          </DrawerHeader>

          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full text-base"
              onClick={() => detailId && openForm(null, detailId)}
            >
              <Plus className="size-4" aria-hidden />
              {t("pointage.add")}
            </Button>

            {days.length === 0 ? (
              <p className="text-muted-foreground mt-4 text-center text-sm">{t("pointage.monthEmpty")}</p>
            ) : (
              <div className="mt-4 space-y-4">
                {days.map(([day, list]) => {
                  const date = `${day}T12:00:00+01:00`;
                  return (
                    <div key={day}>
                      <div className="text-muted-foreground mb-1.5 flex items-baseline justify-between gap-3 text-xs">
                        <span className="tabular">
                          {formatWeekdayShort(date, locale)} {formatDayMonth(date, locale)}
                        </span>
                        <span className="tabular">
                          {formatDuration(closedMinutes(list), locale)}
                        </span>
                      </div>
                      <ul className="border-border divide-border divide-y rounded-lg border">
                        {list.map((shift) => (
                          <ShiftLine
                            key={shift.id}
                            shift={shift}
                            now={now}
                            locale={locale}
                            actions={
                              <span className="-me-2 flex shrink-0">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="size-11"
                                  onClick={() => openForm(shift, shift.user_id)}
                                >
                                  <Pencil className="size-4" aria-hidden />
                                  <span className="sr-only">
                                    {t("common.edit")} — {formatTime(shift.clock_in, locale)}
                                  </span>
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="text-destructive size-11"
                                  onClick={() => {
                                    setDeleting(shift);
                                    setDeleteOpen(true);
                                  }}
                                >
                                  <Trash2 className="size-4" aria-hidden />
                                  <span className="sr-only">
                                    {t("common.delete")} — {formatTime(shift.clock_in, locale)}
                                  </span>
                                </Button>
                              </span>
                            }
                          />
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>

      <PointageShiftForm
        open={formOpen}
        onOpenChange={setFormOpen}
        members={rows}
        shift={editing}
        defaultUserId={formUserId}
        defaultDate={defaultDate}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        tone="danger"
        icon={<Trash2 className="size-4" />}
        title={
          deleting
            ? t("pointage.deleteTitle", { date: formatDayMonth(deleting.clock_in, locale) })
            : ""
        }
        description={
          deleting
            ? t("pointage.deleteBody", {
                start: formatTime(deleting.clock_in, locale),
                end: deleting.clock_out ? formatTime(deleting.clock_out, locale) : t("pointage.ongoing"),
              })
            : undefined
        }
        confirmLabel={t("common.delete")}
        onConfirm={onDelete}
      />
    </section>
  );
}
