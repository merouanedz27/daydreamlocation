import { redirectTo } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

/**
 * La racine n'a pas de contenu propre : l'application commence aux commandes.
 * Le layout `(app)` renverra vers la connexion si la session manque.
 */
export default async function IndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirectTo("/commandes", locale as Locale);
}
