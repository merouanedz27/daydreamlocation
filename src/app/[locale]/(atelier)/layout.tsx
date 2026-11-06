import { getTranslations, setRequestLocale } from "next-intl/server";
import { AtelierHeader } from "@/components/atelier-header";
import { isTailor, requireTailorOrStaff } from "@/lib/auth";
import type { Locale } from "@/i18n/routing";

/**
 * L'ATELIER — le seul endroit du tailleur. Pas de barre basse, pas de bouton
 * « Nouvelle commande » : il scanne, il lit sa liste, c'est tout.
 *
 * Ouvert aussi à l'équipe du magasin (une pièce rendue se scanne au
 * comptoir). Les données passent par `list_alterations` / `mark_altered`, les
 * seules fonctions que le tailleur a le droit d'appeler.
 */
export default async function AtelierLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [profile, t] = await Promise.all([
    requireTailorOrStaff(locale as Locale),
    getTranslations("roles"),
  ]);
  const role = (["owner", "moderator", "tailleur"] as const).find((r) => r === profile.role) ?? "staff";

  return (
    <div className="flex min-h-dvh flex-col">
      <AtelierHeader
        fullName={profile.full_name}
        roleLabel={t(role)}
        homeHref={isTailor(profile) ? "/atelier" : "/retouches"}
      />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5">{children}</main>
    </div>
  );
}
