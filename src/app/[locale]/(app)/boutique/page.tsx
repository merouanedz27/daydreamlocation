import { redirectTo } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

/** Ancienne adresse : la boutique vit désormais dans Paramètres. */
export default async function ShopPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirectTo("/parametres", locale as Locale);
}
