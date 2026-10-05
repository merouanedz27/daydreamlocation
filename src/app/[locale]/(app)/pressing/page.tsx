import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PressingBoard } from "@/components/pressing-board";
import { requireProfile } from "@/lib/auth";
import { getBlockedUnitIds, getPressingUnits } from "@/lib/queries/stock";
import { todayIso } from "@/lib/rental-range";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "nav" });
  return { title: t("pressing") };
}

/**
 * Le pressing (dégraissage) : ce qui y est parti, et de quoi y envoyer.
 *
 * OUVERT À TOUTE L'ÉQUIPE — ce sont les employés qui portent les costumes au
 * pressing. Ils ne peuvent pourtant rien changer d'autre au stock : la page
 * passe par `set_pressing`, qui ne sait faire que disponible ⇄ nettoyage.
 */
export default async function PressingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireProfile(locale as Locale);

  const { q = "" } = await searchParams;
  const [t, units, blocked] = await Promise.all([
    getTranslations(),
    getPressingUnits(),
    getBlockedUnitIds(todayIso()),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl">{t("nav.pressing")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("pressing.hint")}</p>
      </div>

      <PressingBoard units={units} rentedIds={[...blocked]} q={q.trim().slice(0, 80)} />
    </div>
  );
}
