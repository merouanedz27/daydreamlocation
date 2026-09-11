import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarRange, ChevronLeft, Phone, Store, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Link } from "@/i18n/navigation";
import { requireProfile } from "@/lib/auth";
import { getOrder } from "@/lib/queries/orders";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/routing";

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

export async function generateMetadata(props: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await props.params;
  const t = await getTranslations({ locale, namespace: "orders" });
  const order = await getOrder(Number(id));
  return { title: order ? `${order.order_no} — ${order.customer_name}` : t("title") };
}

export default async function OrderPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireProfile(locale as Locale);

  const t = await getTranslations();
  const l = locale as Locale;

  const order = await getOrder(Number(id));
  if (!order) notFound();

  return (
    <div>
      <Link
        href="/commandes"
        className="text-muted-foreground hover:text-foreground -ms-2 mb-4 inline-flex min-h-11 items-center gap-1 px-2 text-sm"
      >
        <ChevronLeft className="size-4 rtl:-scale-x-100" aria-hidden />
        {t("orders.title")}
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl">{order.customer_name}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            <bdi>{order.order_no}</bdi>
          </p>
        </div>
        <Badge className={STATUS_STYLES[order.status]}>
          {t(`orders.status.${STATUS_KEYS[order.status]}`)}
        </Badge>
      </div>

      <dl className="mt-6 space-y-3 text-sm">
        <Line icon={CalendarRange} label={t("orders.eventDate")}>
          <span className="tabular">{formatDate(order.event_date, l)}</span>
        </Line>
        <Line icon={CalendarRange} label={t("orders.rentalWindow")}>
          <span className="tabular">
            {formatDate(order.pickup_date, l)} → {formatDate(order.return_due_date, l)}
          </span>
        </Line>
        {order.customer_phone && (
          <Line icon={Phone} label={t("orders.phone")}>
            <a href={`tel:${order.customer_phone}`} className="underline underline-offset-4">
              <bdi dir="ltr">{order.customer_phone}</bdi>
            </a>
          </Line>
        )}
        {order.profiles?.full_name && (
          <Line icon={User} label={t("roles.staff")}>
            {order.profiles.full_name}
          </Line>
        )}
      </dl>

      <h2 className="mt-8 text-lg">{t("orders.pieces")}</h2>
      <ul className="mt-3 space-y-2">
        {order.order_lines.map((line) => (
          <li
            key={line.id}
            className="border-border flex items-center gap-3 rounded-lg border p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {line.model_name_snapshot ?? line.external_label}
              </p>
              <p className="text-muted-foreground truncate text-sm">
                {line.unit_id === null ? (
                  <>
                    <Store className="me-1 inline size-3" aria-hidden />
                    {line.external_source ?? t("stock.external")}
                  </>
                ) : (
                  line.size_snapshot && `${t("stock.size")} ${line.size_snapshot}`
                )}
              </p>
            </div>
            <span className="tabular shrink-0 text-sm">
              {formatMoney(line.unit_price, l)}
            </span>
          </li>
        ))}
      </ul>

      <Separator className="my-6" />

      <dl className="space-y-2 text-sm">
        <Amount label={t("orders.total")} value={formatMoney(order.total_price, l)} strong />
        <Amount label={t("orders.paid")} value={formatMoney(order.amount_paid, l)} />
        {/* Un reste NÉGATIF n'est pas une dette : le client a versé plus que
            le prix final (acompte encaissé avant une remise). C'est un montant
            à RENDRE, pas une alerte — même règle que sur la liste. */}
        <Amount
          label={
            (order.balance ?? 0) < 0 ? t("orders.toRefund") : t("orders.balance")
          }
          value={formatMoney(Math.abs(order.balance ?? 0), l)}
          warning={(order.balance ?? 0) > 0}
        />
        <Amount label={t("orders.caution")} value={formatMoney(order.caution_amount, l)} />
      </dl>
      <p className="text-muted-foreground mt-3 text-xs">
        {t("orders.cautionNotRevenue")}
      </p>

      {order.notes && (
        <p className="text-muted-foreground mt-6 text-sm whitespace-pre-line">
          {order.notes}
        </p>
      )}
    </div>
  );
}

function Line({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="text-muted-foreground size-4 shrink-0" aria-hidden />
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="ms-auto text-end">{children}</dd>
    </div>
  );
}

function Amount({
  label,
  value,
  strong,
  warning,
}: {
  label: string;
  value: string;
  strong?: boolean;
  warning?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "tabular",
          strong && "text-base font-medium",
          warning && "text-warning-foreground font-medium",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
