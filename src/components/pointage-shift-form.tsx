"use client";

import { useState, useTransition } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { DatePicker } from "@/components/date-picker";
import { saveShift } from "@/lib/actions/pointage";
import { instantToLocalTime, normalizeTime, type Shift } from "@/lib/pointage";
import type { PointageMember } from "@/lib/queries/pointage";
import type { Locale } from "@/i18n/routing";

type Draft = { userId: string; date: string; start: string; end: string; note: string };

function draftOf(shift: Shift | null, userId: string, date: string): Draft {
  if (!shift) return { userId, date, start: "", end: "", note: "" };
  return {
    userId: shift.user_id,
    date: shift.work_date,
    start: instantToLocalTime(shift.clock_in),
    end: shift.clock_out ? instantToLocalTime(shift.clock_out) : "",
    note: shift.note ?? "",
  };
}

/**
 * Ajouter ou corriger une période — propriétaire seulement. Tiroir qui monte
 * du bas : le pouce trouve « Enregistrer » sans remonter l'écran.
 *
 * Les heures se tapent au pavé numérique (« 830 » devient « 08:30 » en
 * quittant le champ) : pas de `<input type="time">`, dont le rendu change d'un
 * téléphone à l'autre et passe parfois en AM/PM.
 */
export function PointageShiftForm({
  open,
  onOpenChange,
  members,
  shift,
  defaultUserId,
  defaultDate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: PointageMember[];
  /** `null` = nouvelle période. */
  shift: Shift | null;
  defaultUserId: string;
  defaultDate: string;
}) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft>(() => draftOf(shift, defaultUserId, defaultDate));
  const [error, setError] = useState<{ field: string | null; key: string } | null>(null);

  // Chaque ouverture repart de la période visée — ajustement pendant le
  // rendu, même motif que `ConfirmDialog`.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(draftOf(shift, defaultUserId, defaultDate));
      setError(null);
    }
  }

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const tidy = (key: "start" | "end") => {
    const value = draft[key];
    if (value) set({ [key]: normalizeTime(value) ?? value });
  };
  const fieldError = (name: string) =>
    error?.field === name ? <FieldError>{t(error.key)}</FieldError> : null;

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const data = new FormData();
    data.set("locale", locale);
    if (shift) data.set("id", String(shift.id));
    data.set("user_id", draft.userId);
    data.set("work_date", draft.date);
    data.set("clock_in", draft.start);
    data.set("clock_out", draft.end);
    data.set("note", draft.note);

    startTransition(async () => {
      const result = await saveShift(data);
      if (!result.ok) {
        setError({ field: result.field ?? null, key: result.error });
        return;
      }
      toast.success(t("pointage.saved"));
      onOpenChange(false);
    });
  }

  return (
    <Drawer open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DrawerContent className="max-h-[92svh]">
        <DrawerHeader className="text-start">
          <DrawerTitle>{shift ? t("pointage.editTitle") : t("pointage.addTitle")}</DrawerTitle>
          <DrawerDescription>{t("pointage.formHint")}</DrawerDescription>
        </DrawerHeader>

        <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-4">
            <FieldGroup>
              <Field data-invalid={error?.field === "user_id" || undefined}>
                <FieldLabel htmlFor="p-member">{t("pointage.member")}</FieldLabel>
                <Select
                  value={draft.userId}
                  onValueChange={(v) => set({ userId: v })}
                  disabled={isPending}
                >
                  <SelectTrigger id="p-member" className="h-12 w-full text-base">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldError("user_id")}
              </Field>

              <Field data-invalid={error?.field === "work_date" || undefined}>
                <FieldLabel htmlFor="p-date">{t("pointage.date")}</FieldLabel>
                <DatePicker
                  id="p-date"
                  value={draft.date}
                  onChange={(v) => set({ date: v })}
                  disabled={isPending}
                />
                {fieldError("work_date")}
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field data-invalid={error?.field === "clock_in" || undefined}>
                  <FieldLabel htmlFor="p-start">
                    {t("pointage.arrival")}
                    <span className="text-destructive ms-0.5" aria-hidden>
                      *
                    </span>
                  </FieldLabel>
                  <Input
                    id="p-start"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={5}
                    placeholder={t("pointage.timePlaceholder")}
                    value={draft.start}
                    onChange={(e) => set({ start: e.target.value })}
                    onBlur={() => tidy("start")}
                    aria-required
                    aria-invalid={error?.field === "clock_in" || undefined}
                    disabled={isPending}
                    className="tabular h-12 text-lg"
                  />
                  {fieldError("clock_in")}
                </Field>

                <Field data-invalid={error?.field === "clock_out" || undefined}>
                  <FieldLabel htmlFor="p-end">{t("pointage.departure")}</FieldLabel>
                  <Input
                    id="p-end"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={5}
                    placeholder={t("pointage.timePlaceholder")}
                    value={draft.end}
                    onChange={(e) => set({ end: e.target.value })}
                    onBlur={() => tidy("end")}
                    aria-invalid={error?.field === "clock_out" || undefined}
                    disabled={isPending}
                    className="tabular h-12 text-lg"
                  />
                  {fieldError("clock_out")}
                </Field>
              </div>
              <FieldDescription className="-mt-3">{t("pointage.departureHint")}</FieldDescription>

              <Field data-invalid={error?.field === "note" || undefined}>
                <FieldLabel htmlFor="p-note">{t("pointage.note")}</FieldLabel>
                <Input
                  id="p-note"
                  autoComplete="off"
                  maxLength={200}
                  placeholder={t("pointage.notePlaceholder")}
                  value={draft.note}
                  onChange={(e) => set({ note: e.target.value })}
                  disabled={isPending}
                  className="h-12 text-base"
                />
                {fieldError("note")}
              </Field>
            </FieldGroup>

            {error && !["user_id", "work_date", "clock_in", "clock_out", "note"].includes(error.field ?? "") && (
              <Alert variant="destructive" className="mt-4">
                <AlertCircle />
                <AlertDescription>{t(error.key)}</AlertDescription>
              </Alert>
            )}
          </div>

          <DrawerFooter>
            <Button type="submit" disabled={isPending} className="h-12 w-full text-base">
              {isPending && <Spinner />}
              {t("common.save")}
            </Button>
            <DrawerClose asChild>
              <Button type="button" variant="ghost" disabled={isPending} className="h-12 w-full text-base">
                {t("common.cancel")}
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
