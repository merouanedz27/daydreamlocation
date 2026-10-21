import { getTranslations, setRequestLocale } from "next-intl/server";
import { AppHeader } from "@/components/app-header";
import { BottomNav } from "@/components/bottom-nav";
import { NewOrderFab } from "@/components/new-order-fab";
import { AppFooter } from "@/components/app-footer";
import { UpdateNotifier } from "@/components/update-notifier";
import { CustomerMessageProvider } from "@/components/customer-message";
import { NotificationsBell } from "@/components/notifications-bell";
import { ConnectionBanner, OfflineSync } from "@/components/offline-sync";
import { canManageStock, requireProfile, isOwner } from "@/lib/auth";
import { getSettings } from "@/lib/queries/orders";
import { getUnreadNotificationCount } from "@/lib/queries/notifications";
import type { Locale } from "@/i18n/routing";

/**
 * Layout protégé. Toute page sous `(app)` exige une session valide.
 *
 * Le contrôle se fait ICI et non dans le proxy : la doc Next déconseille
 * explicitement d'y placer l'authentification. Et même si ce garde-fou sautait,
 * RLS ne renverrait aucune donnée — c'est la vraie protection.
 */
export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // En parallèle : chaque attente en série retardait l'affichage de TOUTES les
  // pages. Les réglages ne fuient pas sans session : RLS les refuse.
  const [profile, t, settings, notificationCount] = await Promise.all([
    requireProfile(locale as Locale),
    getTranslations("roles"),
    // Le message type de la boutique, pour chaque bouton 💬 des listes.
    getSettings(),
    // Le compteur seul : la liste se charge à l'ouverture de la cloche.
    getUnreadNotificationCount(),
  ]);

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader
        fullName={profile.full_name}
        roleLabel={t(
          profile.role === "owner" || profile.role === "moderator" ? profile.role : "staff",
        )}
        showDashboard={isOwner(profile)}
        notifications={
          <NotificationsBell
            locale={locale as Locale}
            userId={profile.id}
            initialCount={notificationCount}
          />
        }
      />

      {/* Hors ligne / de nouveau en ligne, collé sous la barre du haut. */}
      <ConnectionBanner />

      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        {/* `?? ""` : tant que la migration n'est pas appliquée, la colonne
            n'existe pas et `select *` ne la renvoie pas. */}
        <CustomerMessageProvider template={settings.customer_message ?? ""}>
          {children}
        </CustomerMessageProvider>
        <NewOrderFab />
      </div>

      <AppFooter showOwnerLinks={isOwner(profile)} showStockLinks={canManageStock(profile)} />

      <BottomNav />

      {/* Cliché hors ligne, file des gestes faits sans réseau, et sa pastille. */}
      <OfflineSync userId={profile.id} locale={locale as Locale} />

      {/* Pas en développement : chaque rechargement à chaud changerait la version. */}
      {process.env.NODE_ENV !== "development" && <UpdateNotifier />}
    </div>
  );
}
