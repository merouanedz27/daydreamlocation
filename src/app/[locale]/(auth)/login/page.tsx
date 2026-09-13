import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getProfile } from "@/lib/auth";
import { redirectTo } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { SignInForm } from "@/components/sign-in-form";
import ddLogo from "../../../../../public/dd-logo.png";

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
        {/* Ici le logo COMPLET, mot « location » compris : c'est le seul écran
            qui ait la place de le montrer en entier, et le seul où l'on arrive
            sans savoir encore où l'on est.
            Aucune plaque n'est nécessaire — la page est blanche, exactement le
            fond pour lequel le logo a été dessiné (son bloc clair #EEEEEE ne
            s'en détache que de 1,16:1, ce qui est voulu). À surveiller le jour
            où le mode sombre s'ouvrira : ce logo est un bitmap à deux tons
            fait pour un fond clair, et son brun #522504 s'y effacerait.
            Le nom de l'application reste le NOM ACCESSIBLE du titre, via
            `alt` : le logo est un bitmap, un lecteur d'écran n'y lit rien. */}
        <header className="text-center">
          <h1 className="leading-none">
            <Image
              src={ddLogo}
              alt={t("app.name")}
              priority
              /* Largeur d'affichage FIXE. Sans cette indication, next/image
                 raisonne sur la largeur de l'écran et sert un fichier de
                 1080 px pour une image de 176 px — sur un forfait mobile
                 algérien, c'est du gâchis pur. */
              sizes="176px"
              className="mx-auto h-auto w-44"
            />
          </h1>
          <p className="text-muted-foreground mt-4 text-sm">{t("app.tagline")}</p>
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
