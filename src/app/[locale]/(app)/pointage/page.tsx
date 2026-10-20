import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PointageCounter, PointageDays } from "@/components/pointage-days";
import { PointageTeam } from "@/components/pointage-team";
import { isOwner, requireProfile } from "@/lib/auth";
import { getMyPeriod, getPayMonthDays, getTeamPeriods } from "@/lib/queries/pointage";
import { todayIso } from "@/lib/rental-range";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "nav" });
  return { title: t("pointage") };
}

/**
 * Pointage — la version du client : on coche les ABSENCES.
 *
 *   - L'EMPLOYÉ voit son tableau (jour | absent) depuis sa dernière paie, et
 *     ne coche que le jour où il ne vient pas. Il ne relit que ses cases (RLS).
 *   - Le PROPRIÉTAIRE voit chaque employé et ses jours travaillés (jours dus
 *     − absences) ; quand il le paie, le compteur repart à zéro.
 *
 * Pas dans la barre basse : le titre reste donc visible (`daydream-ui`).
 */
export default async function PointagePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;
  const profile = await requireProfile(l);
  const t = await getTranslations();
  const today = todayIso();
  const owner = isOwner(profile);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl">{t("nav.pointage")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {owner ? t("pointage.hintTeam") : t("pointage.hint")}
        </p>
      </div>

      {owner ? (
        <TeamSheet today={today} />
      ) : (
        <WorkerSheet profile={profile} today={today} />
      )}
    </div>
  );
}

/** Les deux lectures en parallèle : chaque attente en série retarde la page. */
async function TeamSheet({ today }: { today: string }) {
  const [team, monthDays] = await Promise.all([getTeamPeriods(today), getPayMonthDays()]);
  return <PointageTeam today={today} team={team} monthDays={monthDays} />;
}

async function WorkerSheet({
  profile,
  today,
}: {
  profile: { id: string; full_name: string; work_start_date: string | null };
  today: string;
}) {
  const period = await getMyPeriod(profile, today);
  return (
    <>
      <PointageCounter
        worked={period.worked}
        absences={period.absences}
        start={period.start}
      />
      <PointageDays
        mode="self"
        userId={period.id}
        start={period.start}
        today={today}
        absences={period.absences}
        lockedThrough={period.resets[0]?.paid_through ?? null}
      />
    </>
  );
}
