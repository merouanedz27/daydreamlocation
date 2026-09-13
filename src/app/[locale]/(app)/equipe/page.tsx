import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MemberForm } from "@/components/member-form";
import { TeamList } from "@/components/team-list";
import { requireOwner } from "@/lib/auth";
import { getTeam } from "@/lib/queries/profiles";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "nav" });
  return { title: t("team") };
}

export default async function TeamPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Qui entre dans l'équipe, et ce que chacun peut voir : c'est la décision de
  // l'administrateur seul. Redirection et non 404 — la page existe, elle n'est
  // simplement pas la sienne.
  const profile = await requireOwner(locale as Locale);

  const t = await getTranslations();
  const members = await getTeam();

  return (
    <div>
      {/* Cet écran ne figure PAS dans la barre de navigation : rien d'autre ne
          le nomme, son titre reste donc visible. C'est la règle inverse de
          celle des pages d'onglet. */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-xl font-medium">{t("team.title")}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t("team.hint")}</p>
        </div>
        <MemberForm />
      </div>

      <div className="ornament mt-5" aria-hidden>
        <span className="ornament-diamond" />
      </div>

      <TeamList members={members} currentId={profile.id} />
    </div>
  );
}
