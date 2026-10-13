import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ShopSettingsForm } from "@/components/shop-settings-form";
import { NotificationsPanel } from "@/components/notifications-panel";
import { NotificationRulesForm } from "@/components/notification-rules-form";
import {
  EmailTextsForm,
  type EmailDefaults,
  type EmailSamples,
} from "@/components/email-texts-form";
import { SettingsTabs } from "@/components/settings-tabs";
import { parseSettingsTab } from "@/lib/settings-tabs";
import { requireOwner } from "@/lib/auth";
import { emailConfigured } from "@/lib/email/send";
import { formatDate, formatLongDay } from "@/lib/format";
import { EMAIL_LOCALES, parseEmailTexts, parseRules } from "@/lib/notification-settings";
import { getSettings } from "@/lib/queries/orders";
import { getNotificationTeam } from "@/lib/queries/profiles";
import { addDays, todayIso } from "@/lib/rental-range";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "settings" });
  return { title: t("title") };
}

/**
 * Paramètres — réservé à l'administrateur : la boutique (bon de location,
 * message client), les notifications de l'équipe (cloche / push par
 * événement) et les e-mails automatiques (destinataires, textes).
 */
export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ onglet?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const profile = await requireOwner(locale as Locale);

  const { onglet } = await searchParams;
  const initial = parseSettingsTab(onglet);

  const [t, settings, members, emailT] = await Promise.all([
    getTranslations(),
    getSettings(),
    getNotificationTeam(),
    Promise.all(EMAIL_LOCALES.map((lang) => getTranslations({ locale: lang, namespace: "email" }))),
  ]);

  // Le texte par défaut de chaque e-mail, écrit AVEC les champs ({numero}…) :
  // affiché en gris dans le champ vide, il montre la syntaxe en même temps.
  const defaults = { new_order: {}, daily: {} } as EmailDefaults;
  const samples = { new_order: {}, daily: {} } as EmailSamples;
  const today = todayIso();
  EMAIL_LOCALES.forEach((lang, i) => {
    const te = emailT[i];
    defaults.new_order[lang] = {
      subject: te("newOrder.subject", { orderNo: "{numero}", customer: "{nom}" }),
      intro: te("newOrder.by", { name: "{auteur}" }),
    };
    defaults.daily[lang] = {
      subject: te("daily.subject", { count: 3, date: "{date}" }),
      intro: te("daily.intro", { count: 3 }),
    };
    samples.new_order[lang] = {
      numero: "0123",
      nom: t(lang === "ar" ? "settings.emails.sampleNameAr" : "settings.emails.sampleNameFr"),
      date: formatDate(addDays(today, 30), lang),
      auteur: profile.full_name,
    };
    samples.daily[lang] = { date: formatLongDay(addDays(today, 1), lang), nombre: "3" };
  });

  return (
    <div className="max-w-2xl">
      {/* Écran hors barre de navigation : son titre reste visible. */}
      <h1 className="font-heading text-xl font-medium">{t("settings.title")}</h1>
      <p className="text-muted-foreground mt-1 text-sm">{t("settings.hint")}</p>

      <SettingsTabs
        initial={initial}
        shop={
          <ShopSettingsForm
            settings={{
              shop_address: settings.shop_address ?? null,
              shop_phone: settings.shop_phone ?? null,
              rental_terms_fr: settings.rental_terms_fr ?? null,
              rental_terms_ar: settings.rental_terms_ar ?? null,
              customer_message: settings.customer_message ?? null,
            }}
          />
        }
        notifications={<NotificationRulesForm initial={parseRules(settings.notification_rules)} />}
        emails={
          <>
            <NotificationsPanel
              members={members}
              currentId={profile.id}
              configured={emailConfigured()}
            />
            <EmailTextsForm
              initial={parseEmailTexts(settings.email_texts)}
              defaults={defaults}
              samples={samples}
            />
          </>
        }
      />
    </div>
  );
}
