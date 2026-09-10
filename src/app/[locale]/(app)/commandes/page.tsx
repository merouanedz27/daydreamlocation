import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarPlus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatMoney } from "@/lib/format";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "orders" });
  return { title: t("title") };
}

const STATUS_STYLES: Record<string, string> = {
  reservee: "bg-gold-soft text-foreground border-transparent",
  en_cours: "bg-gold-soft text-foreground border-transparent",
  retournee: "bg-success-soft text-success-foreground border-transparent",
  annulee: "bg-muted text-muted-foreground border-transparent",
};

const STATUS_KEYS: Record<string, string> = {
  reservee: "reserved",
  en_cours: "inProgress",
  retournee: "returned",
  annulee: "cancelled",
};

export default async function OrdersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations();
  const l = locale as Locale;

  const supabase = await createClient();
  const { data: orders } = await supabase
    .from("orders")
    .select("id, order_no, customer_name, event_date, total_price, balance, status")
    .order("event_date", { ascending: false })
    .limit(50);

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl">{t("orders.title")}</h1>
        <Button asChild className="hidden md:inline-flex">
          <Link href="/commandes/nouvelle">
            <Plus className="size-4" aria-hidden />
            {t("orders.new")}
          </Link>
        </Button>
      </div>

      {!orders?.length ? (
        <div className="border-border mt-8 flex flex-col items-center rounded-lg border border-dashed px-6 py-16 text-center">
          <CalendarPlus className="text-muted-foreground size-8" aria-hidden />
          <p className="text-muted-foreground mt-4 text-sm">{t("common.empty")}</p>
          <Button asChild className="mt-6">
            <Link href="/commandes/nouvelle">
              <Plus className="size-4" aria-hidden />
              {t("orders.new")}
            </Link>
          </Button>
        </div>
      ) : (
        // Une carte par ligne : un <table> ne passe pas à 390 px.
        // Voir `daydream-ui`.
        <ul className="mt-6 space-y-3">
          {orders.map((order) => (
            <li key={order.id}>
              <Link
                href={`/commandes/${order.id}`}
                className="border-border bg-card hover:border-primary block rounded-lg border p-4 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{order.customer_name}</p>
                    <p className="text-muted-foreground mt-0.5 text-sm">
                      <bdi>{order.order_no}</bdi>
                      {" · "}
                      <span className="tabular">
                        {formatDate(order.event_date, l)}
                      </span>
                    </p>
                  </div>

                  <Badge className={STATUS_STYLES[order.status]}>
                    {t(`orders.status.${STATUS_KEYS[order.status]}`)}
                  </Badge>
                </div>

                <div className="border-border mt-3 flex items-center justify-between border-t pt-3 text-sm">
                  <span className="text-muted-foreground">
                    {t("orders.total")}{" "}
                    <span className="tabular text-foreground font-medium">
                      {formatMoney(order.total_price, l)}
                    </span>
                  </span>

                  {order.balance !== null && order.balance > 0 && (
                    <span className="text-warning-foreground tabular font-medium">
                      {t("orders.balance")} {formatMoney(order.balance, l)}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
