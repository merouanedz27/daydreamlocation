import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PointageCounter, PointageDays } from "@/components/pointage-days";
import { PointageTeam } from "@/components/pointage-team";
import { isOwner, requireProfile } from "@/lib/auth";
import { getMyPeriod, getTeamPeriods } from "@/lib/queries/pointage";
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
 * Pointage — la version du client : une case par jour.
 *
 *   - L'EMPLOYÉ voit son tableau (jour | case) depuis sa dernière paie, et
 *     coche la case du jour en arrivant. Il ne relit que ses cases (RLS).
 *   - Le PROPRIÉTAIRE voit chaque employé et son nombre de jours ; quand il le
 *     paie, un bouton remet ce compteur à zéro.
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
        <PointageTeam today={today} team={await getTeamPeriods(today)} />
      ) : (
        <WorkerSheet profile={profile} today={today} />
      )}
    </div>
  );
}

async function WorkerSheet({
  profile,
  today,
}: {
  profile: { id: string; full_name: string };
  today: string;
}) {
  const period = await getMyPeriod(profile, today);
  return (
    <>
      <PointageCounter count={period.checked.length} start={period.start} />
      <PointageDays
        mode="self"
        userId={period.id}
        start={period.start}
        today={today}
        checked={period.checked}
        lockedThrough={period.resets[0]?.paid_through ?? null}
      />
    </>
  );
}
