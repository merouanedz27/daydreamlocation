"use client";

import { useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Bell, Smartphone } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { updateNotificationRules } from "@/lib/actions/settings";
import {
  RULE_KINDS,
  type NotificationRules,
  type RuleKind,
} from "@/lib/notification-settings";
import type { Locale } from "@/i18n/routing";

/**
 * Pour chaque événement : la cloche et le push, coupés séparément.
 *
 * Chaque bascule s'enregistre AUSSITÔT, comme les cases e-mail de chaque
 * membre. Les envois partent l'un après l'autre (chaîne de promesses), chacun
 * avec l'état complet : la dernière écriture est toujours la bonne.
 */
export function NotificationRulesForm({ initial }: { initial: NotificationRules }) {
  const t = useTranslations("settings.rules");
  const tErrors = useTranslations();
  const { locale } = useParams<{ locale: Locale }>();
  const [rules, setRules] = useState(initial);
  const saved = useRef(initial);
  const queue = useRef<Promise<void>>(Promise.resolve());

  function toggle(kind: RuleKind, channel: "bell" | "push", value: boolean) {
    const next = { ...rules, [kind]: { ...rules[kind], [channel]: value } };
    setRules(next);
    queue.current = queue.current.then(async () => {
      const result = await updateNotificationRules({ locale, rules: next });
      if (result.ok) {
        saved.current = next;
        return;
      }
      setRules(saved.current);
      toast.error(tErrors(result.error));
    });
  }

  return (
    <section className="mt-6">
      <p className="text-muted-foreground text-sm">{t("intro")}</p>

      <ul className="border-border bg-card mt-4 divide-y rounded-lg border">
        <li className="text-muted-foreground flex items-center justify-end gap-2 px-3 py-2 text-xs font-medium">
          <span className="flex w-14 flex-col items-center gap-0.5">
            <Bell className="size-4" aria-hidden />
            {t("bell")}
          </span>
          <span className="flex w-14 flex-col items-center gap-0.5">
            <Smartphone className="size-4" aria-hidden />
            {t("push")}
          </span>
        </li>
        {RULE_KINDS.map((kind) => (
          <li key={kind} className="flex items-center gap-2 px-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t(`${kind}.label`)}</p>
              <p className="text-muted-foreground mt-0.5 text-xs">{t(`${kind}.hint`)}</p>
            </div>
            {(["bell", "push"] as const).map((channel) => (
              <span key={channel} className="flex w-14 shrink-0 justify-center">
                <Switch
                  size="lg"
                  className="data-unchecked:bg-muted-foreground/30"
                  checked={rules[kind][channel]}
                  onCheckedChange={(value) => toggle(kind, channel, value)}
                  aria-label={`${t(`${kind}.label`)} — ${t(channel)}`}
                />
              </span>
            ))}
          </li>
        ))}
      </ul>

      <ul className="text-muted-foreground mt-3 list-disc space-y-1 ps-5 text-xs">
        <li>{t("noteActor")}</li>
        <li>{t("notePush")}</li>
      </ul>
    </section>
  );
}
