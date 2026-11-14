import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ParkedList } from "@/components/parked-list";
import { requireProfile } from "@/lib/auth";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "orders.parked" });
  return { title: t("pageTitle") };
}

/**
 * Les clients EN ATTENTE — l'onglet qui a remplacé « Frais » dans la barre
 * basse. Après « Enregistrer », la saisie revient ici quand plusieurs clients
 * attendent encore.
 *
 * La liste vit dans le TÉLÉPHONE, pas en base : la page ne fait que poser le
 * cadre, le composant client la lit.
 */
export default async function ParkedOrdersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireProfile(locale as Locale);
  const t = await getTranslations("orders.parked");

  return (
    <div>
      <h1 className="text-xl">{t("pageTitle")}</h1>
      <p className="text-muted-foreground mt-1 text-sm">{t("pageHint")}</p>
      <div className="mt-4">
        <ParkedList />
      </div>
    </div>
  );
}
