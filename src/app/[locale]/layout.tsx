import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Cairo, Inter } from "next/font/google";
import { DirectionProvider } from "@/components/ui/direction";
import { Toaster } from "@/components/ui/sonner";
import { localeDirection, routing, type Locale } from "@/i18n/routing";
import "../globals.css";

// Latin — Inter. Corps et titres. Dessinée pour les écrans et pour les petites
// tailles : c'est ce que l'équipe lit toute la journée sur son téléphone.
// Police VARIABLE : pas de liste de graisses à déclarer, un seul fichier couvre
// 400 / 500 / 700.
const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});

// Arabe — Cairo. Corps et titres également.
// Le sous-ensemble « latin » est indispensable et non décoratif : même en arabe
// l'application affiche des chiffres occidentaux (prix, dates, tailles) et des
// références latines (« Gio-079-01 »). Sans lui, tous ces caractères tombaient
// sur la police système — c'était le cas avec Tajawal.
const cairo = Cairo({
  subsets: ["arabic", "latin"],
  variable: "--font-cairo",
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
      className={`${inter.variable} ${cairo.variable} h-full antialiased`}
      style={
        {
          // Ces deux variables sont le SEUL endroit du produit qui connaisse
          // la locale. Tout le reste du CSS utilise `font-sans` / `font-heading`
          // sans jamais tester la langue.
          //
          // Une seule famille par langue : la hiérarchie se fait à la GRAISSE,
          // pas au changement de police. Les deux variables restent distinctes
          // pour pouvoir réintroduire un caractère de titre sans toucher aux
          // composants, qui utilisent déjà `font-heading`.
          "--font-sans": isArabic ? "var(--font-cairo)" : "var(--font-inter)",
          "--font-heading": isArabic ? "var(--font-cairo)" : "var(--font-inter)",
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
