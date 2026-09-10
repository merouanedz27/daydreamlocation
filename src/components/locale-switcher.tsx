"use client";

import { useParams } from "next/navigation";
import { useTransition } from "react";
import { Languages } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { locales, localeLabels, type Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/**
 * Bascule FR / AR. Conserve la page courante : `usePathname` de `@/i18n/navigation`
 * retourne le chemin SANS préfixe de locale, que `router.replace` re-préfixe.
 */
export function LocaleSwitcher({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const [isPending, startTransition] = useTransition();

  const current = params.locale as Locale;

  return (
    <div
      className={cn(
        "border-border bg-card inline-flex items-center gap-1 rounded-full border p-1",
        isPending && "opacity-60",
        className,
      )}
    >
      <Languages
        className="text-muted-foreground ms-2 size-4 shrink-0"
        aria-hidden
      />
      {locales.map((locale) => {
        const isActive = locale === current;
        return (
          <button
            key={locale}
            type="button"
            disabled={isPending || isActive}
            aria-current={isActive ? "true" : undefined}
            onClick={() =>
              startTransition(() => {
                router.replace(pathname, { locale });
              })
            }
            className={cn(
              "min-h-9 rounded-full px-3 text-sm transition-colors",
              isActive
                ? "bg-primary text-primary-foreground font-medium"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {localeLabels[locale]}
          </button>
        );
      })}
    </div>
  );
}
