import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PressingBack, PressingTabs } from "@/components/pressing-board";
import { requireProfile } from "@/lib/auth";
import { getPressingUnits } from "@/lib/queries/stock";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "pressing" });
  return { title: t("tabOut") };
}

/**
 * Le pressing, onglet « Au pressing » : les pièces parties au dégraissage, à
 * faire revenir (avec le prix du pressing, facultatif, noté en frais).
 * Ouvert à toute l'équipe, comme l'onglet « À envoyer ».
 */
export default async function PressingOutPage({
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
  const [t, units] = await Promise.all([getTranslations(), getPressingUnits()]);

  const out = units.filter((u) => u.status === "nettoyage");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl">{t("nav.pressing")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("pressing.hint")}</p>
      </div>

      <PressingTabs toSend={units.length - out.length} out={out.length} />

      <PressingBack units={out} q={q.trim().slice(0, 80)} />
    </div>
  );
}
