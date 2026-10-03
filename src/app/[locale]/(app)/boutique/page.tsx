import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ShopSettingsForm } from "@/components/shop-settings-form";
import { requireOwner } from "@/lib/auth";
import { getSettings } from "@/lib/queries/orders";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "shop" });
  return { title: t("title") };
}

export default async function ShopPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Ce que le bon de location promet au client engage la boutique : c'est au
  // propriétaire seul de l'écrire. Les employés, eux, LISENT ces réglages en
  // imprimant un bon — la policy `settings_read` le leur permet.
  await requireOwner(locale as Locale);

  const t = await getTranslations();
  const settings = await getSettings();

  return (
    <div className="max-w-2xl">
      {/* Écran hors barre de navigation : son titre reste visible, comme
          celui de l'équipe. */}
      <h1 className="font-heading text-xl font-medium">{t("shop.title")}</h1>
      <p className="text-muted-foreground mt-1 text-sm">{t("shop.hint")}</p>

      <div className="ornament mt-5" aria-hidden>
        <span className="ornament-diamond" />
      </div>

      <ShopSettingsForm
        settings={{
          // `?? null` : tant que la migration n'est pas appliquée, ces colonnes
          // n'existent pas et `select *` ne les renvoie pas.
          shop_address: settings.shop_address ?? null,
          shop_phone: settings.shop_phone ?? null,
          rental_terms_fr: settings.rental_terms_fr ?? null,
          rental_terms_ar: settings.rental_terms_ar ?? null,
          customer_message: settings.customer_message ?? null,
        }}
      />
    </div>
  );
}
