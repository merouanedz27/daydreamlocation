import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Noto_Kufi_Arabic, Roboto } from "next/font/google";
import { DirectionProvider } from "@/components/ui/direction";
import { Toaster } from "@/components/ui/sonner";
import { localeDirection, routing, type Locale } from "@/i18n/routing";
import "../globals.css";

// Latin — Roboto. Lu toute la journée sur téléphone : on privilégie la
// lisibilité aux petites tailles.
const roboto = Roboto({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "700"],
  variable: "--font-roboto",
  display: "swap",
});

// Arabe — Noto Kufi Arabic.
// C'est une police de caractère KUFI, donc très dessinée : superbe en titres,
// plus dense que la moyenne en corps de texte. Si l'équipe trouve les listes
// fatigantes à lire, passer le corps de texte en Noto Sans Arabic et garder le
// Kufi pour les titres — le basculement se fait ici, `--font-sans` étant la
// seule variable que le reste du CSS connaisse.
const notoKufi = Noto_Kufi_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "700"],
  variable: "--font-kufi",
  display: "swap",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "app" });

  return {
    title: { default: t("name"), template: `%s · ${t("name")}` },
    description: t("tagline"),
    applicationName: t("name"),
    appleWebApp: { capable: true, title: t("name"), statusBarStyle: "default" },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  themeColor: "#FFFFFF",
  width: "device-width",
  initialScale: 1,
  // L'équipe travaille au téléphone : le zoom reste autorisé (accessibilité).
  maximumScale: 5,
  viewportFit: "cover",
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  // Permet le rendu statique des pages qui n'ont pas besoin de la requête.
  setRequestLocale(locale);

  const dir = localeDirection[locale as Locale];
  const isArabic = locale === "ar";

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${roboto.variable} ${notoKufi.variable} h-full antialiased`}
      style={
        {
          // `--font-sans` bascule selon la langue ; tout le reste du CSS
          // n'a jamais à savoir quelle locale est active.
          "--font-sans": isArabic ? "var(--font-kufi)" : "var(--font-roboto)",
        } as React.CSSProperties
      }
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        {/* DirectionProvider informe les primitives Radix du sens d'écriture
            (menus, sliders, carrousels ouvrent du bon côté). */}
        <DirectionProvider dir={dir}>
          <NextIntlClientProvider>{children}</NextIntlClientProvider>
          <Toaster position="top-center" dir={dir} />
        </DirectionProvider>
      </body>
    </html>
  );
}
