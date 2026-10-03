import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { WifiOff } from "lucide-react";
import { RetryButton } from "@/components/retry-button";
import { routing } from "@/i18n/routing";
import suit from "../../../../public/logo-suit.png";
import wordmark from "../../../../public/logo-wordmark.png";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "offline" });
  return { title: t("title"), robots: { index: false } };
}

/**
 * Page « hors ligne » — ce que montre l'application installée quand une page
 * ne peut pas être chargée faute de réseau (cf. `src/app/sw.ts`).
 *
 * Mise en cache à l'installation du service worker, elle ne peut dépendre ni
 * d'une session ni d'une donnée : d'où sa place HORS des groupes `(app)` et
 * `(print)`, et son rendu statique.
 *
 * Logo `unoptimized` : servi tel quel depuis `/_next/static`, que le worker
 * garde. Via `/_next/image`, jamais mis en cache, il manquerait hors ligne.
 */
export default async function OfflinePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm text-center">
        <Image src={suit} alt="" unoptimized priority className="mx-auto h-auto w-16" />
        <Image
          src={wordmark}
          alt={t("app.name")}
          unoptimized
          priority
          className="mx-auto mt-3 h-auto w-52"
        />

        <div className="ornament my-8" aria-hidden>
          <span className="ornament-diamond" />
        </div>

        <WifiOff className="text-muted-foreground mx-auto size-8" aria-hidden />
        <h1 className="font-heading mt-4 text-xl font-medium">{t("offline.title")}</h1>
        <p className="text-muted-foreground mt-2 text-sm">{t("offline.body")}</p>

        <div className="mt-8">
          <RetryButton />
        </div>
      </div>
    </main>
  );
}
