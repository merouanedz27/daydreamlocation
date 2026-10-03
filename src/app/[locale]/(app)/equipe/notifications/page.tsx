import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationsPanel } from "@/components/notifications-panel";
import { requireOwner } from "@/lib/auth";
import { emailConfigured } from "@/lib/email/send";
import { getNotificationTeam } from "@/lib/queries/profiles";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "notifications" });
  return { title: t("title") };
}

/**
 * Notifications par e-mail : le message de l'administrateur à l'équipe, et
 * qui reçoit les deux e-mails automatiques (nouvelle commande, liste du soir).
 * Réservé à l'administrateur, comme l'écran Équipe d'où l'on y vient.
 */
export default async function NotificationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const profile = await requireOwner(locale as Locale);

  const [t, members] = await Promise.all([getTranslations(), getNotificationTeam()]);

  return (
    <div>
      <Button asChild variant="ghost" className="-ms-3 h-11">
        <Link href="/equipe">
          <ChevronLeft className="size-4 rtl:-scale-x-100" aria-hidden />
          {t("team.title")}
        </Link>
      </Button>

      <h1 className="font-heading mt-1 text-xl font-medium">{t("notifications.title")}</h1>
      <p className="text-muted-foreground mt-1 text-sm">{t("notifications.hint")}</p>

      <NotificationsPanel
        members={members}
        currentId={profile.id}
        configured={emailConfigured()}
      />
    </div>
  );
}
