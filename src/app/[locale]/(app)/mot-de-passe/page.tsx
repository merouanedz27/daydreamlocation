import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PasswordForm } from "@/components/password-form";
import { requireProfile } from "@/lib/auth";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "account" });
  return { title: t("changePassword") };
}

/** Pour TOUS les rôles : chacun change son propre mot de passe. */
export default async function PasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const profile = await requireProfile(locale as Locale);
  const t = await getTranslations();

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl">{t("account.changePassword")}</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        {t("account.changePasswordHint", { email: profile.email ?? profile.full_name })}
      </p>

      <div className="ornament my-6" aria-hidden>
        <span className="ornament-diamond" />
      </div>

      <PasswordForm />
    </div>
  );
}
