import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MemberForm } from "@/components/member-form";
import { TeamList } from "@/components/team-list";
import { requireOwner } from "@/lib/auth";
import { getTeam } from "@/lib/queries/profiles";
import { matchesSearch } from "@/lib/search";
import { Link } from "@/i18n/navigation";
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
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Qui entre dans l'équipe, et ce que chacun peut voir : c'est la décision de
  // l'administrateur seul. Redirection et non 404 — la page existe, elle n'est
  // simplement pas la sienne.
  const profile = await requireOwner(locale as Locale);

  const t = await getTranslations();
  // Recherche de l'en-tête : nom ou adresse e-mail.
  const { q = "" } = await searchParams;
  const members = (await getTeam()).filter((m) => matchesSearch(q, m.full_name, m.email));

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
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="h-11">
            <Link href="/equipe/notifications">
              <Bell className="size-4" aria-hidden />
              {t("notifications.title")}
            </Link>
          </Button>
          <MemberForm />
        </div>
      </div>

      <div className="ornament mt-5" aria-hidden>
        <span className="ornament-diamond" />
      </div>

      <TeamList members={members} currentId={profile.id} />
    </div>
  );
}
