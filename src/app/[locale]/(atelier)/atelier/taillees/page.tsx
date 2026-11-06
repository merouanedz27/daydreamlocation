import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AlterationsView } from "@/components/alterations-view";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "alterations" });
  return { title: t("atelierTitle") };
}

/** Voir `AlterationsView` : la même liste pour l'atelier et pour le magasin. */
export default async function AtelierDonePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <AlterationsView mode="tailor" status="taillee" />;
}
