"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowRight, Check, Minus } from "lucide-react";
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
 * Qui est là, maintenant. Une carte par membre actif, les présents d'abord.
 *
 * Trois états, chacun porté par un MOT et une icône — jamais la couleur
 * seule : en service (vert), parti (gris, avec l'horaire), pas pointé.
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
    const open = own.find((s) => !s.clock_out) ?? null;
    const day = own.filter((s) => s.work_date === today);
    const minutes = own
      .filter((s) => s.work_date === today || !s.clock_out)
      .reduce((sum, s) => sum + shiftMinutes(s, now), 0);
    const status = open ? "in" : day.length ? "out" : "none";
    return { member, open, day, minutes, status } as const;
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
        {rows.map(({ member, open, day, minutes, status }) => {
          const first = day[0];
          const last = day[day.length - 1];
          return (
            <li
              key={member.id}
              className={cn(
                "border-border flex min-h-14 items-center gap-3 rounded-lg border py-2 ps-3 pe-3",
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
                <p className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-xs">
                  {status === "in" && open && (
                    <span className="text-success-foreground inline-flex items-center gap-1 font-medium">
                      <span aria-hidden className="bg-success size-1.5 rounded-full" />
                      {t("status.in")}
                      <span className="text-muted-foreground font-normal">
                        · {t("since", { time: formatTime(open.clock_in, locale) })}
                      </span>
                    </span>
                  )}
                  {status === "out" && first && last && (
                    <>
                      <span className="inline-flex items-center gap-1">
                        <Check className="size-3.5" aria-hidden />
                        {t("status.out")}
                      </span>
                      <span className="tabular inline-flex items-center gap-1">
                        · {formatTime(first.clock_in, locale)}
                        <ArrowRight className="size-3 rtl:-scale-x-100" aria-hidden />
                        {last.clock_out ? formatTime(last.clock_out, locale) : ""}
                      </span>
                    </>
                  )}
                  {status === "none" && (
                    <span className="inline-flex items-center gap-1">
                      <Minus className="size-3.5" aria-hidden />
                      {t("status.none")}
                    </span>
                  )}
                </p>
              </div>

              {status !== "none" && (
                <span className="tabular shrink-0 text-end text-sm font-medium" suppressHydrationWarning>
                  {formatDuration(minutes, locale)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
