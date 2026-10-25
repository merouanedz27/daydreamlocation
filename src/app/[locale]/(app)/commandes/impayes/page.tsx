import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CircleCheck } from "lucide-react";
import { UnpaidList } from "@/components/unpaid-list";
import { getUnpaidOrders } from "@/lib/queries/dashboard";
import { formatMoney, formatNumber } from "@/lib/format";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "nav" });
  return { title: t("unpaid") };
}

/**
 * Les impayés, pour TOUTE l'équipe : la même liste que le tableau de bord,
 * sans le reste des chiffres financiers. Ce sont les employés qui encaissent
 * le reste au retrait — ils doivent savoir qui doit encore.
 *
 * Rien de nouveau n'est exposé : chaque employé lit déjà le reste sur la fiche
 * de la commande. Le total est la somme des lignes affichées, donc celle de la
 * recherche quand il y en a une.
 */
export default async function UnpaidPage({
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
  const orders = await getUnpaidOrders(null, q);
  const total = orders.reduce((sum, o) => sum + (o.balance ?? 0), 0);

  return (
    <div>
      <h1 className="text-xl">{t("nav.unpaid")}</h1>
      {orders.length > 0 && (
        <p className="text-muted-foreground mt-1 text-sm">
          <span className="text-warning-foreground tabular font-medium">
            {formatMoney(total, l)}
          </span>
          {" · "}
          {t("dashboard.unpaidCount", {
            count: formatNumber(orders.length, l),
          })}
        </p>
      )}

      <div className="mt-4">
        {orders.length ? (
          <div className="border-border rounded-lg border p-4">
            <UnpaidList orders={orders} locale={l} collapse={false} />
          </div>
        ) : (
          <div className="border-border flex flex-col items-center rounded-lg border border-dashed px-6 py-14 text-center">
            <CircleCheck className="text-success-foreground size-8" aria-hidden />
            <p className="text-muted-foreground mt-3 text-sm">
              {q ? t("search.noMatch", { q }) : t("dashboard.allPaid")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
