import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CircleCheck } from "lucide-react";
import { OrderRowList } from "@/components/order-row";
import { getNotReturned } from "@/lib/queries/orders-list";
import { daysBetween, todayIso } from "@/lib/rental-range";
import { formatNumber } from "@/lib/format";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "nav" });
  return { title: t("notReturned") };
}

/**
 * « Li Marj3ouch » de son AppSheet : les tenues SORTIES et pas encore
 * revenues. C'est la liste qu'on appelle pour récupérer les costumes — d'où le
 * téléphone sur chaque ligne et le retour prévu à la place de l'événement.
 *
 * Le bouton ✓ valide le retour en un toucher : la ligne quitte la liste.
 */
export default async function NotReturnedPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;
  const t = await getTranslations();

  const { q = "" } = await searchParams;
  const orders = await getNotReturned(q);
  const today = todayIso();
  const late = orders.filter((o) => daysBetween(today, o.return_due_date) < 0).length;

  return (
    <div>
      <h1 className="text-xl">{t("nav.notReturned")}</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        {t("calendar.count", { count: orders.length, n: formatNumber(orders.length, l) })}
        {late > 0 && (
          <>
            {" · "}
            <span className="text-warning-foreground font-medium">
              {t("calendar.lateCount", { count: late, n: formatNumber(late, l) })}
            </span>
          </>
        )}
      </p>

      <div className="mt-4">
        {orders.length ? (
          <OrderRowList orders={orders} date="return" action="returned" />
        ) : (
          <div className="border-border flex flex-col items-center rounded-lg border border-dashed px-6 py-14 text-center">
            <CircleCheck className="text-success-foreground size-8" aria-hidden />
            <p className="text-muted-foreground mt-3 text-sm">
              {q ? t("search.noMatch", { q }) : t("calendar.allBack")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
