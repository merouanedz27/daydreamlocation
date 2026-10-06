import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { OrderQuickForm } from "@/components/order-quick-form";
import { requireProfile } from "@/lib/auth";
import {
  getOrder,
  getOrderCatalogue,
  getLabelSlots,
  getQuickSuggestions,
  getSettings,
} from "@/lib/queries/orders";
import { draftFromOrder } from "@/lib/quick-draft";
import { normalizeSearch } from "@/lib/search";
import { defaultWindow } from "@/lib/rental-range";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata(props: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await props.params;
  const t = await getTranslations({ locale, namespace: "orders" });
  const order = await getOrder(Number(id));
  return { title: order ? t("edit.title", { no: order.order_no }) : t("title") };
}

/**
 * Modifier une commande — le formulaire de SAISIE, rouvert sur elle, comme son
 * AppSheet rouvre une ligne. Mêmes cases, mêmes listes, mêmes gestes : rien à
 * réapprendre pour corriger une faute.
 *
 * Ouvert à toute l'équipe, comme la saisie. La base revérifie tout à
 * l'enregistrement (`update_order`) : RLS, et disponibilité de chaque pièce du
 * stock sur les nouvelles dates.
 */
export default async function EditOrderPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireProfile(locale as Locale);

  const orderId = Number(id);
  if (!Number.isInteger(orderId) || orderId <= 0) notFound();

  const t = await getTranslations();
  const [order, { models }, { items, customers }, settings, labelSlots] = await Promise.all([
    getOrder(orderId),
    getOrderCatalogue(),
    getQuickSuggestions(),
    getSettings(),
    getLabelSlots(),
  ]);
  if (!order) notFound();

  const back = (
    <Link
      href={`/commandes/${order.id}`}
      className="text-muted-foreground hover:text-foreground -ms-2 mb-4 inline-flex min-h-11 items-center gap-1 px-2 text-sm"
    >
      <ChevronLeft className="size-4 rtl:-scale-x-100" aria-hidden />
      {order.customer_name}
    </Link>
  );

  // Une commande annulée a rendu ses pièces : la modifier les rebloquerait en
  // silence. On le dit, et on renvoie vers la fiche, où elle se rétablit.
  if (order.status === "annulee") {
    return (
      <div>
        {back}
        <div className="border-border bg-muted rounded-lg border p-4">
          <p className="font-medium">{t("orders.cancelledBanner")}</p>
          <p className="text-muted-foreground mt-1 text-sm">{t("errors.orderCancelledEdit")}</p>
          <Button asChild variant="outline" className="mt-4 h-11">
            <Link href={`/commandes/${order.id}`}>{t("orders.edit.backToOrder")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Ce que la page sait pour remettre chaque pièce dans sa case.
  const categoryByUnit = new Map<number, string | null>();
  for (const model of models) {
    for (const unit of model.units) categoryByUnit.set(unit.id, unit.part ?? model.category_slug);
  }

  const initial = draftFromOrder(order, {
    slotOf: (label) => labelSlots.get(normalizeSearch(label)) ?? null,
    categoryOfUnit: (unitId) => categoryByUnit.get(unitId) ?? null,
    defaultWindow: defaultWindow(
      order.event_date,
      settings.days_before_event,
      settings.days_after_event,
    ),
  });

  return (
    <div>
      {back}
      <OrderQuickForm
        models={models}
        items={items}
        customers={customers}
        settings={settings}
        edit={{ orderId: order.id, orderNo: order.order_no, initial }}
      />
    </div>
  );
}
