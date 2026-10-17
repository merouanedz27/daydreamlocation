import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PointageClock } from "@/components/pointage-clock";
import { PointageMonth } from "@/components/pointage-month";
import { PointageTabs } from "@/components/pointage-tabs";
import { PointageToday } from "@/components/pointage-today";
import { isOwner, requireProfile } from "@/lib/auth";
import {
  closedMinutes,
  monthBounds,
  parseMonth,
  parsePointageTab,
  type Shift,
} from "@/lib/pointage";
import { getMembers, getShifts } from "@/lib/queries/pointage";
import { startOfWeek, todayIso } from "@/lib/rental-range";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "nav" });
  return { title: t("pointage") };
}

/** Ce que la pointeuse affiche : le jour, la période ouverte, la semaine. */
function clockProps(mine: Shift[], today: string, weekFrom: string) {
  const week = mine.filter((s) => s.work_date >= weekFrom);
  return {
    today,
    shifts: mine.filter((s) => s.work_date === today || !s.clock_out),
    weekClosedMinutes: closedMinutes(week),
    weekDays: new Set(week.map((s) => s.work_date)).size,
  };
}

/**
 * Pointage de travail.
 *
 * OUVERT À TOUTE L'ÉQUIPE : chacun pointe son arrivée et son départ depuis
 * son téléphone — une fois par jour — et ne relit que ses propres journées
 * (RLS). Le propriétaire a, en plus, l'équipe du jour et le mois, avec la
 * correction des oublis.
 * Pas de calcul de salaire : des jours et des heures, rien d'autre.
 *
 * Pas dans la barre basse : le titre reste donc visible (`daydream-ui`).
 */
export default async function PointagePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ onglet?: string; mois?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;
  const profile = await requireProfile(l);
  const t = await getTranslations();

  const today = todayIso();
  const weekFrom = startOfWeek(today, l);

  const header = (
    <div>
      <h1 className="text-xl">{t("nav.pointage")}</h1>
      <p className="text-muted-foreground mt-1 text-sm">{t("pointage.hint")}</p>
    </div>
  );

  if (!isOwner(profile)) {
    // La RLS ne rend que ses propres lignes.
    const mine = await getShifts(weekFrom, today);
    return (
      <div className="space-y-5">
        {header}
        <PointageClock {...clockProps(mine, today, weekFrom)} />
      </div>
    );
  }

  const query = await searchParams;
  const tab = parsePointageTab(query.onglet);
  const month = parseMonth(query.mois);
  const { from, to } = monthBounds(month);

  const [members, mine, todayShifts, monthShifts] = await Promise.all([
    getMembers(),
    getShifts(weekFrom, today, profile.id),
    getShifts(today, today),
    getShifts(from, to),
  ]);

  return (
    <div>
      {header}
      <PointageTabs
        initial={tab}
        me={<PointageClock {...clockProps(mine, today, weekFrom)} />}
        today={
          <PointageToday
            today={today}
            members={members.filter((m) => m.is_active)}
            shifts={todayShifts}
          />
        }
        month={
          <PointageMonth
            month={month}
            today={today}
            members={members}
            // Une période ouverte d'un autre mois revient avec la requête : elle
            // n'appartient pas à ce mois-ci.
            shifts={monthShifts.filter((s) => s.work_date >= from && s.work_date <= to)}
          />
        }
      />
    </div>
  );
}
