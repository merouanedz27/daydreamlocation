import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronRight, WifiOff } from "lucide-react";
import { OfflineBackButton } from "@/components/offline-back-button";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "offline" });
  return { title: t("title"), robots: { index: false } };
}

/** Les écrans que le téléphone garde toujours (voir `/api/offline/pages`). */
const KEPT = [
  { path: "/commandes", key: "nav.orders" },
  { path: "/commandes/demain", key: "nav.tomorrow" },
  { path: "/commandes/pas-rentres", key: "nav.notReturned" },
  { path: "/commandes/nouvelle", key: "orders.new" },
  { path: "/pointage", key: "nav.pointage" },
  { path: "/frais", key: "nav.frais" },
] as const;

/**
 * Sans réseau, un écran JAMAIS OUVERT sur ce téléphone — le seul cas où
 * l'application ne peut pas se montrer telle quelle (les autres écrans sont
 * resservis par le service worker, voir `src/app/sw.ts`).
 *
 * Une phrase, « Retour », et les écrans gardés. Même barre du haut que
 * l'application, rien de plus. Statique et sans session : mise en cache à
 * l'installation du service worker.
 *
 * Les liens sont de vrais `<a>` : une navigation complète, que le service
 * worker sert depuis son cache.
 */
export default async function OfflinePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-nav-border bg-nav text-nav-foreground sticky top-0 z-40 border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center px-4">
          <span className="font-heading text-base font-medium">{t("app.name")}</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-4 py-6">
        <div className="border-warning-foreground/30 bg-warning-soft text-warning-foreground flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm">
          <WifiOff className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <h1 className="font-medium">{t("offline.title")}</h1>
            <p className="mt-0.5">{t("offline.body")}</p>
          </div>
        </div>

        <div className="mt-4">
          <OfflineBackButton />
        </div>

        <h2 className="text-muted-foreground mt-6 mb-2 text-xs font-medium">{t("offline.keptTitle")}</h2>
        <ul className="border-border bg-card divide-border divide-y rounded-lg border">
          {KEPT.map(({ path, key }) => (
            <li key={path}>
              <a
                href={`/${locale}${path}`}
                className="flex min-h-12 items-center justify-between gap-3 px-3 text-sm"
              >
                {t(key)}
                <ChevronRight className="text-muted-foreground size-4 rtl:-scale-x-100" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
