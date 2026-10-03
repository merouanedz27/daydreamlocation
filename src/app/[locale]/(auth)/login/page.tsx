import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getProfile } from "@/lib/auth";
import { redirectTo } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { SignInForm } from "@/components/sign-in-form";
import suit from "../../../../../public/logo-suit.png";
import wordmark from "../../../../../public/logo-wordmark.png";

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
        {/* Ici le logo COMPLET du bon : la veste, puis le mot « DAYDREAM ·
            LOCATION ». C'est le seul écran qui ait la place de les montrer
            ensemble, et le seul où l'on arrive sans savoir encore où l'on est.
            Encre sur page blanche, comme sur le papier.
            Le nom de l'application reste le NOM ACCESSIBLE du titre, via
            `alt` : le logo est un bitmap, un lecteur d'écran n'y lit rien. */}
        <header className="text-center">
          <h1 className="leading-none">
            {/* Largeurs d'affichage FIXES (`sizes`) : sans elles, next/image
                raisonne sur la largeur de l'écran et sert un fichier de
                1080 px pour une image de 64 — sur un forfait mobile algérien,
                c'est du gâchis pur. Petit, aussi : à 390 px de large, un grand
                logo poussait « Se connecter » sous le clavier ouvert. */}
            <Image src={suit} alt="" priority sizes="64px" className="mx-auto h-auto w-16" />
            <Image
              src={wordmark}
              alt={t("app.name")}
              priority
              sizes="208px"
              className="mx-auto mt-3 h-auto w-52"
            />
          </h1>
          <p className="text-muted-foreground mt-3 text-sm">{t("app.tagline")}</p>
        </header>

        <div className="ornament my-6" aria-hidden>
          <span className="ornament-diamond" />
        </div>

        <section
          aria-labelledby="login-title"
          className="border-border bg-card rounded-lg border p-6"
        >
          <div className="mb-6">
            <h2 id="login-title" className="font-heading text-xl font-medium">
              {t("auth.welcome")}
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">{t("auth.welcomeHint")}</p>
          </div>
          <SignInForm />
        </section>

        {/* Pas d'inscription publique : sans cette ligne, un nouvel employé
            cherche en vain un lien « Créer un compte ». */}
        <p className="text-muted-foreground mt-6 text-center text-sm text-balance">
          {t("auth.noAccount")}
        </p>

        <div className="mt-6 flex justify-center">
          <LocaleSwitcher />
        </div>
      </div>
    </main>
  );
}
