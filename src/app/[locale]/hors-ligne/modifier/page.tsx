import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { OfflineOrderForm } from "@/components/offline-order-form";
import { routing, type Locale } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale });
  return { title: t("orders.title"), robots: { index: false } };
}

/**
 * La modification de commande SANS RÉSEAU, servie par le service worker à la
 * place de `/commandes/<id>/modifier` (l'adresse reste celle-là : la page y
 * relit l'identifiant). Tout ce qui s'y enregistre est provisoire.
 *
 * Statique, hors des groupes `(app)` : mise en cache à l'installation du
 * service worker, elle ne dépend d'aucune session. Les données viennent
 * d'IndexedDB, côté navigateur (`OfflineOrderForm`).
 */
export default async function OfflineOrderPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <OfflineOrderForm locale={locale as Locale} mode="edit" />;
}
