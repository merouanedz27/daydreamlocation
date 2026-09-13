"use client";

import { useTranslations } from "next-intl";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Recharge la page demandée : une fois le réseau revenu, elle s'affiche. */
export function RetryButton() {
  const t = useTranslations();
  return (
    <Button type="button" className="h-12 w-full text-base" onClick={() => location.reload()}>
      <RotateCw className="size-4" aria-hidden />
      {t("offline.retry")}
    </Button>
  );
}
