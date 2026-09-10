import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getProfile } from "@/lib/auth";
import { redirectTo } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { SignInForm } from "@/components/sign-in-form";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return { title: t("signIn") };
}

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Déjà connecté : inutile de repasser par la connexion.
  if (await getProfile()) {
    redirectTo("/commandes", locale as Locale);
  }

  const t = await getTranslations();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <header className="text-center">
          <h1 className="text-4xl leading-tight">{t("app.name")}</h1>
          <p className="text-muted-foreground mt-2 text-sm">{t("app.tagline")}</p>
        </header>

        <div className="ornament my-8" aria-hidden>
          <span className="ornament-diamond" />
        </div>

        <div className="border-border bg-card rounded-lg border p-6">
          <SignInForm />
        </div>

        <div className="mt-8 flex justify-center">
          <LocaleSwitcher />
        </div>
      </div>
    </main>
  );
}
