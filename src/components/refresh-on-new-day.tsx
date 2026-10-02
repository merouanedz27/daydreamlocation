"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { todayIso, type IsoDate } from "@/lib/rental-range";

/**
 * Recharge l'écran quand la date du jour a changé depuis son rendu.
 *
 * Le téléphone de la boutique reste souvent ouvert sur « Demain » d'un jour à
 * l'autre : sans ça, le lendemain matin, la liste montrerait encore les
 * mariages de la veille. On revérifie au retour sur l'onglet, et chaque minute.
 */
export function RefreshOnNewDay({ day }: { day: IsoDate }) {
  const router = useRouter();

  useEffect(() => {
    const check = () => {
      if (document.visibilityState === "visible" && todayIso() !== day) router.refresh();
    };
    const timer = window.setInterval(check, 60_000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [day, router]);

  return null;
}
