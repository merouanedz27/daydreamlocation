"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, Minus } from "lucide-react";
import { useNow } from "@/components/pointage-clock";
import { formatDuration, formatTime } from "@/lib/format";
import { shiftMinutes, type Shift } from "@/lib/pointage";
import type { PointageMember } from "@/lib/queries/pointage";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/routing";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Qui a pointé aujourd'hui — la question du propriétaire, et rien d'autre.
 * Une carte par membre actif : son arrivée, son départ. Ceux qui n'ont pas
 * pointé descendent en bas, sur fond grisé : on les repère d'un coup d'œil.
 *
 * Trois états, chacun porté par un MOT et une icône — jamais la couleur
 * seule : en service (vert), parti (✓), pas pointé (—).
 */
export function PointageToday({
  today,
  members,
  shifts,
}: {
  today: string;
  members: PointageMember[];
  shifts: Shift[];
}) {
  const t = useTranslations("pointage");
  const { locale } = useParams<{ locale: Locale }>();
  const now = useNow();

  if (members.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("teamEmpty")}</p>;
  }

  const rows = members.map((member) => {
    const own = shifts.filter((s) => s.user_id === member.id);
    // La journée en cours : celle d'aujourd'hui, ou celle de la veille restée ouverte.
    const shift = own.find((s) => !s.clock_out) ?? own.find((s) => s.work_date === today) ?? null;
    const status = !shift ? "none" : shift.clock_out ? "out" : "in";
    return { member, shift, status } as const;
  });
  const rank = { in: 0, out: 1, none: 2 };
  rows.sort((a, b) => rank[a.status] - rank[b.status]);
  const present = rows.filter((r) => r.status === "in").length;

  return (
    <section aria-labelledby="pointage-team">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 id="pointage-team" className="text-base font-medium">
          {t("teamToday")}
        </h2>
        <span className="text-muted-foreground text-sm">{t("presentCount", { count: present })}</span>
      </div>

      <ul className="space-y-1.5">
        {rows.map(({ member, shift, status }) => (
          <li
            key={member.id}
            className={cn(
              "border-border flex min-h-16 items-center gap-3 rounded-lg border py-2 ps-3 pe-3",
              status === "none" ? "bg-muted/40" : "bg-card",
            )}
          >
            <span
              aria-hidden
              className="bg-gold-soft text-foreground flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-medium"
            >
              {initials(member.full_name)}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{member.full_name}</p>
              <p className="mt-0.5 text-xs">
                {status === "in" && (
                  <span className="text-success-foreground inline-flex items-center gap-1 font-medium">
                    <span aria-hidden className="bg-success size-1.5 rounded-full" />
                    {t("status.in")}
                    {shift && (
                      <span className="tabular text-muted-foreground font-normal" suppressHydrationWarning>
                        · {formatDuration(shiftMinutes(shift, now), locale)}
                      </span>
                    )}
                  </span>
                )}
                {status === "out" && shift && (
                  <span className="text-muted-foreground inline-flex items-center gap-1">
                    <Check className="size-3.5" aria-hidden />
                    {t("status.out")}
                    <span className="tabular">· {formatDuration(shiftMinutes(shift), locale)}</span>
                  </span>
                )}
                {status === "none" && (
                  <span className="text-muted-foreground inline-flex items-center gap-1">
                    <Minus className="size-3.5" aria-hidden />
                    {t("status.none")}
                  </span>
                )}
              </p>
            </div>

            {/* Arrivée / départ : deux colonnes fixes, alignées de carte en carte. */}
            <dl className="grid shrink-0 grid-cols-2 gap-3 text-end">
              <div className="w-12">
                <dt className="text-muted-foreground text-[11px]">{t("arrival")}</dt>
                <dd className="tabular text-sm font-medium">
                  {shift ? formatTime(shift.clock_in, locale) : "—"}
                </dd>
              </div>
              <div className="w-12">
                <dt className="text-muted-foreground text-[11px]">{t("departure")}</dt>
                <dd className="tabular text-sm font-medium">
                  {shift?.clock_out ? formatTime(shift.clock_out, locale) : "—"}
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </section>
  );
}
