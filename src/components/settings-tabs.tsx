"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SETTINGS_TABS, type SettingsTab } from "@/lib/settings-tabs";

/**
 * Les trois onglets de Paramètres. L'onglet ouvert s'écrit dans l'adresse
 * (`?onglet=`) sans recharger la page : un lien ou un retour arrière rouvre
 * le bon onglet, et les anciennes adresses (/boutique, /equipe/notifications)
 * y redirigent.
 */
export function SettingsTabs({
  initial,
  shop,
  notifications,
  emails,
}: {
  initial: SettingsTab;
  shop: React.ReactNode;
  notifications: React.ReactNode;
  emails: React.ReactNode;
}) {
  const t = useTranslations("settings.tabs");
  const [tab, setTab] = useState<SettingsTab>(initial);

  function onChange(value: string) {
    const next = value as SettingsTab;
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("onglet", next);
    window.history.replaceState(window.history.state, "", url);
  }

  return (
    <Tabs value={tab} onValueChange={onChange} className="mt-5">
      {/* Contrôle segmenté : la pastille active reste DANS la barre (la hauteur
          imposée par le composant de base, 32 px, la faisait déborder). */}
      <TabsList className="grid h-auto w-full grid-cols-3 rounded-xl p-1 group-data-horizontal/tabs:h-auto sm:w-96">
        {SETTINGS_TABS.map((value) => (
          <TabsTrigger
            key={value}
            value={value}
            className="h-10 rounded-lg px-2 text-sm data-active:shadow-sm"
          >
            {t(value)}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="boutique">{shop}</TabsContent>
      <TabsContent value="notifications">{notifications}</TabsContent>
      <TabsContent value="emails">{emails}</TabsContent>
    </Tabs>
  );
}
