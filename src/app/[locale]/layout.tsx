import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Noto_Kufi_Arabic, Roboto, Tajawal } from "next/font/google";
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

// Arabe, CORPS DE TEXTE — Tajawal.
// C'est la police que l'équipe lit vraiment : listes de commandes, tailles,
// montants, notes. Humaniste et ouverte, elle reste confortable en petit corps.
const tajawal = Tajawal({
  subsets: ["arabic"],
  weight: ["400", "500", "700"],
  variable: "--font-tajawal",
  display: "swap",
});

// Arabe, TITRES — Noto Kufi Arabic.
// Police kufique, très dessinée : elle donne son caractère au produit en grand,
// mais fatigue en corps de texte. On la réserve donc aux titres.
const notoKufi = Noto_Kufi_Arabic({
  subsets: ["arabic"],
  weight: ["500", "700"],
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
      className={`${roboto.variable} ${tajawal.variable} ${notoKufi.variable} h-full antialiased`}
      style={
        {
          // Ces deux variables sont le SEUL endroit du produit qui connaisse
          // la locale. Tout le reste du CSS utilise `font-sans` / `font-heading`
          // sans jamais tester la langue.
          //
          // En arabe, corps et titres emploient deux familles différentes :
          // Tajawal se lit sans fatigue en petit, le Kufi n'apporte son
          // caractère qu'en grand. En français, Roboto assure les deux.
          "--font-sans": isArabic ? "var(--font-tajawal)" : "var(--font-roboto)",
          "--font-heading": isArabic ? "var(--font-kufi)" : "var(--font-roboto)",
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
