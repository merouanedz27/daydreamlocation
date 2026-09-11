import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { OrdersList, type OrderRow } from "@/components/orders-list";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "orders" });
  return { title: t("title") };
}

export default async function OrdersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations();

  const supabase = await createClient();
  // On remonte TOUTES les colonnes réglables d'un coup : le choix se fait côté
  // client, par appareil, et refaire une requête à chaque case cochée serait
  // absurde pour une liste de 50 lignes.
  const { data: orders } = await supabase
    .from("orders")
    .select(
      `id, order_no, customer_name, customer_phone, event_date, pickup_date,
       status, total_price, amount_paid, balance, caution_amount`,
    )
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

      <OrdersList orders={(orders ?? []) as OrderRow[]} />
    </div>
  );
}
