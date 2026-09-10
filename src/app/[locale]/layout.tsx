import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Cormorant_Garamond, Inter, Tajawal } from "next/font/google";
import { DirectionProvider } from "@/components/ui/direction";
import { Toaster } from "@/components/ui/sonner";
import { localeDirection, routing, type Locale } from "@/i18n/routing";
import "../globals.css";

// UI et données — la lisibilité prime, c'est lu toute la journée sur téléphone.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// Titres et montants — la signature « faire-part ». Voir `daydream-ui`.
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

// Arabe. Pas d'équivalent serif display convaincant : le contraste
// se fait à la graisse, pas à la famille.
const tajawal = Tajawal({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "700"],
  variable: "--font-tajawal",
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
  themeColor: "#FBF8F3",
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
      className={`${inter.variable} ${cormorant.variable} ${tajawal.variable} h-full antialiased`}
      style={
        {
          // `--font-sans` bascule selon la langue ; tout le reste du CSS
          // n'a jamais à savoir quelle locale est active.
          "--font-sans": isArabic ? "var(--font-tajawal)" : "var(--font-inter)",
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
