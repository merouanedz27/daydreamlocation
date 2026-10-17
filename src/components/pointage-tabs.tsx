"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { POINTAGE_TABS, type PointageTab } from "@/lib/pointage";

/**
 * Les trois onglets du propriétaire : sa propre pointeuse, l'équipe du jour,
 * le mois. Même contrôle segmenté que Paramètres, onglet écrit dans
 * l'adresse (`?onglet=`) — le changement de mois recharge la page sur le bon
 * onglet.
 */
export function PointageTabs({
  initial,
  me,
  today,
  month,
}: {
  initial: PointageTab;
  me: React.ReactNode;
  today: React.ReactNode;
  month: React.ReactNode;
}) {
  const t = useTranslations("pointage.tabs");
  const [tab, setTab] = useState<PointageTab>(initial);

  function onChange(value: string) {
    const next = value as PointageTab;
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("onglet", next);
    window.history.replaceState(window.history.state, "", url);
  }

  return (
    <Tabs value={tab} onValueChange={onChange} className="mt-5">
      <TabsList className="grid h-auto w-full grid-cols-3 rounded-xl p-1 group-data-horizontal/tabs:h-auto sm:w-96">
        {POINTAGE_TABS.map((value) => (
          <TabsTrigger
            key={value}
            value={value}
            className="h-10 rounded-lg px-2 text-sm data-active:shadow-sm"
          >
            {t(value)}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="moi" className="mt-4">
        {me}
      </TabsContent>
      <TabsContent value="aujourdhui" className="mt-4">
        {today}
      </TabsContent>
      <TabsContent value="mois" className="mt-4">
        {month}
      </TabsContent>
    </Tabs>
  );
}
