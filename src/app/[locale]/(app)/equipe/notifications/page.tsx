import { redirectTo } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

/** Ancienne adresse : les e-mails vivent désormais dans Paramètres → E-mails. */
export default async function NotificationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirectTo("/parametres?onglet=emails", locale as Locale);
}
