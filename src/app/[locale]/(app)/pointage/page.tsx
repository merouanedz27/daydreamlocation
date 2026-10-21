import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PointageCounter, PointageDays } from "@/components/pointage-days";
import { PointageTeam } from "@/components/pointage-team";
import { isOwner, requireProfile } from "@/lib/auth";
import { asPayType, markKind } from "@/lib/pointage";
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
 * Pointage — la version du client : payé à la journée.
 *
 *   - L'EMPLOYÉ voit son tableau depuis sa dernière paie. Permanent, il coche
 *     le jour où il ne vient pas (jour | absent) ; remplaçant, le jour où il
 *     vient (jour | présent). Il ne relit que ses cases (RLS).
 *   - Le PROPRIÉTAIRE voit chaque employé et ses jours payables ; il le paie
 *     au prix d'une journée et le compteur repart à zéro.
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
  const payType = asPayType(profile.pay_type);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl">{t("nav.pointage")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {owner
            ? t("pointage.hintTeam")
            : payType === "remplacant"
              ? t("pointage.hintRemplacant")
              : t("pointage.hint")}
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

async function TeamSheet({ today }: { today: string }) {
  const team = await getTeamPeriods(today);
  return <PointageTeam today={today} team={team} />;
}

async function WorkerSheet({
  profile,
  today,
}: {
  profile: {
    id: string;
    full_name: string;
    work_start_date: string | null;
    pay_type: string;
    daily_rate: number | null;
  };
  today: string;
}) {
  const period = await getMyPeriod(profile, today);
  const kind = markKind(period.payType);
  return (
    <>
      <PointageCounter
        kind={kind}
        worked={period.worked}
        marks={period.marks}
        start={period.start}
      />
      <PointageDays
        kind={kind}
        mode="self"
        userId={period.id}
        start={period.start}
        today={today}
        marks={period.marks}
        lockedThrough={period.resets[0]?.paid_through ?? null}
      />
    </>
  );
}
