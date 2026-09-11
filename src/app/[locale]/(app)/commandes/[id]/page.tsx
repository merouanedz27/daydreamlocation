import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Phone,
  Shirt,
  Store,
  StickyNote,
  User,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Link } from "@/i18n/navigation";
import { isOwner, requireProfile } from "@/lib/auth";
import { getOrder, type OrderDetailLine } from "@/lib/queries/orders";
import { daysBetween, todayIso } from "@/lib/rental-range";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
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
  const profile = await requireProfile(locale as Locale);

  const t = await getTranslations();
  const l = locale as Locale;

  const order = await getOrder(Number(id));
  if (!order) notFound();

  const owner = isOwner(profile);
  const today = todayIso();
  const closed = order.status === "retournee" || order.status === "annulee";

  /**
   * Les trois dates de la commande, dans l'ordre où elles arrivent.
   * Le patron ne saisit que celle de l'événement ; les deux autres en sont
   * déduites. Les montrer ensemble évite d'avoir à refaire ce calcul de tête
   * chaque fois qu'on ouvre une fiche.
   */
  const steps = [
    { key: "pickup", label: t("orders.pickupDate"), date: order.pickup_date },
    { key: "event", label: t("orders.event"), date: order.event_date },
    { key: "return", label: t("orders.returnDate"), date: order.return_due_date },
  ];

  /** « Aujourd'hui », « Demain », « Dans 5 jours ». Rien pour une date passée. */
  function relative(date: string): string | null {
    const days = daysBetween(today, date);
    if (days < 0) return null;
    if (days === 0) return t("orders.today");
    if (days === 1) return t("orders.tomorrow");
    return t("orders.inDays", { count: formatNumber(days, l) });
  }

  /**
   * Prochaine échéance : la première date encore à venir.
   *
   * ON NE DÉCLARE AUCUN RETARD. Il serait tentant d'afficher « en retard »
   * dès que la date de retour est passée — ce serait faux : rien dans
   * l'application ne fait encore avancer le statut d'une commande, donc
   * toutes les commandes anciennes s'annonceraient en retard. Une alerte qui
   * se déclenche sur tout n'est plus une alerte. Le jour où les cases
   * « Aller validé » / « Retour validé » existeront, le retard deviendra
   * calculable pour de vrai.
   */
  const next = closed ? undefined : steps.find((s) => daysBetween(today, s.date) >= 0);
  const imminent = next && daysBetween(today, next.date) <= 1 ? next : undefined;

  const balance = order.balance ?? 0;

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
        <Badge className={cn("shrink-0", STATUS_STYLES[order.status])}>
          {t(`orders.status.${STATUS_KEYS[order.status]}`)}
        </Badge>
      </div>

      {/* Rappel d'échéance : uniquement aujourd'hui ou demain. Au-delà, la
          frise suffit — un bandeau permanent finirait par ne plus être lu. */}
      {imminent && (
        <p className="bg-gold-soft text-foreground mt-4 flex items-center gap-2 rounded-lg px-4 py-3 text-sm">
          <CalendarClock className="text-gold-strong size-4 shrink-0" aria-hidden />
          <span>
            <span className="font-medium">{imminent.label}</span>
            {" · "}
            {relative(imminent.date)}
            <span className="text-muted-foreground">
              {" — "}
              <span className="tabular">{formatDate(imminent.date, l)}</span>
            </span>
          </span>
        </p>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-3 lg:items-start">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("orders.rentalWindow")}</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Frise des trois dates. Le trait est un élément décoratif posé
                  DERRIÈRE les pastilles : `inset-x` s'applique des deux côtés
                  à la fois, il n'a donc pas de sens de lecture à inverser. */}
              <ol className="relative grid grid-cols-3 gap-1">
                <span
                  className="bg-border absolute inset-x-[16.666%] top-[5px] h-px"
                  aria-hidden
                />
                {steps.map((step) => {
                  const isNext = next?.key === step.key;
                  // Le décompte ne s'affiche QUE sous la prochaine échéance.
                  // Sous les trois dates il devenait du bruit : « dans 110 »,
                  // « dans 111 », « dans 112 » ne disent rien de plus que la
                  // première, et noient la seule qui appelle une action.
                  const rel = isNext ? relative(step.date) : null;
                  return (
                    <li key={step.key} className="flex flex-col items-center gap-2 text-center">
                      <span
                        className={cn(
                          "relative size-2.5 rounded-full",
                          isNext ? "bg-gold-strong" : "bg-border",
                        )}
                        aria-hidden
                      />
                      <span className="text-muted-foreground text-xs">{step.label}</span>
                      <span
                        className={cn(
                          "tabular text-sm",
                          step.key === "event" && "font-medium",
                        )}
                      >
                        {formatDate(step.date, l)}
                      </span>
                      {rel && (
                        <span
                          className={cn(
                            "text-xs",
                            isNext ? "text-gold-strong" : "text-muted-foreground",
                          )}
                        >
                          {rel}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>

              {order.actual_return_date && (
                <p className="text-muted-foreground mt-4 text-sm">
                  {t("orders.actualReturn", {
                    date: formatDate(order.actual_return_date, l),
                  })}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shirt className="text-muted-foreground size-4" aria-hidden />
                {t("orders.pieces")}
                <span className="text-muted-foreground ms-auto text-xs font-normal">
                  {t("orders.piecesCount", {
                    count: formatNumber(order.order_lines.length, l),
                  })}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <ul>
                {order.order_lines.map((line) => (
                  <PieceRow
                    key={line.id}
                    line={line}
                    locale={l}
                    showCost={owner}
                    labels={{
                      size: t("stock.size"),
                      external: t("stock.external"),
                      cost: t("orders.externalCost"),
                      view: t("orders.viewInStock"),
                    }}
                  />
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 lg:sticky lg:top-20">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="text-muted-foreground size-4" aria-hidden />
                {t("orders.amounts")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2">
                {/* Sous-total et remise ne s'affichent QUE s'il y a eu une
                    remise : sinon ils répètent le total et noient la seule
                    ligne qui compte. */}
                {order.discount > 0 && (
                  <>
                    <Amount
                      label={t("orders.subtotal")}
                      value={formatMoney(order.subtotal, l)}
                    />
                    <Amount
                      label={t("orders.discount")}
                      value={`− ${formatMoney(order.discount, l)}`}
                    />
                  </>
                )}

                <Amount
                  label={t("orders.total")}
                  value={formatMoney(order.total_price, l)}
                  strong
                />

                <Separator className="my-3" />

                <Amount label={t("orders.paid")} value={formatMoney(order.amount_paid, l)} />

                {/* Un reste NÉGATIF n'est pas une dette : le client a versé plus
                    que le prix final (acompte encaissé avant une remise). C'est
                    un montant à RENDRE, pas une alerte — même règle que sur la
                    liste. Et un reste nul se dit « Soldé » : le mot porte
                    l'information, jamais la seule couleur. */}
                <Amount
                  label={balance < 0 ? t("orders.toRefund") : t("orders.balance")}
                  value={balance === 0 ? t("orders.settled") : formatMoney(Math.abs(balance), l)}
                  tone={balance > 0 ? "warning" : balance === 0 ? "success" : "muted"}
                  strong
                />

                <Separator className="my-3" />

                <Amount
                  label={t("orders.caution")}
                  value={formatMoney(order.caution_amount, l)}
                  note={order.caution_returned ? t("orders.cautionReturned") : undefined}
                />
              </dl>

              <p className="text-muted-foreground mt-4 text-xs">
                {t("orders.cautionNotRevenue")}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="text-muted-foreground size-4" aria-hidden />
                {t("orders.customer")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-medium">{order.customer_name}</p>

              {/* Appeler le client est le geste le plus fréquent depuis cette
                  fiche : un vrai bouton de 44 px, pas un numéro souligné. */}
              {order.customer_phone && (
                <Button asChild variant="outline" className="mt-3 h-11 w-full justify-start">
                  <a href={`tel:${order.customer_phone}`}>
                    <Phone className="size-4" aria-hidden />
                    <span className="sr-only">{t("orders.callCustomer")}</span>
                    <bdi dir="ltr" className="tabular">
                      {order.customer_phone}
                    </bdi>
                  </a>
                </Button>
              )}

              <p className="text-muted-foreground mt-3 text-xs">
                {order.profiles?.full_name
                  ? t("orders.createdBy", {
                      date: formatDate(order.created_at, l),
                      name: order.profiles.full_name,
                    })
                  : t("orders.createdOn", { date: formatDate(order.created_at, l) })}
              </p>
            </CardContent>
          </Card>

          {order.notes && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <StickyNote className="text-muted-foreground size-4" aria-hidden />
                  {t("orders.notesTitle")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm whitespace-pre-line">
                  {order.notes}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Une ligne de la commande.
 *
 * Deux cas bien distincts, et c'est `unit_id` qui tranche, pas le libellé :
 * une pièce du stock mène à sa fiche modèle ; une pièce EXTERNE, sous-louée
 * chez un confrère, n'existe nulle part dans le stock — elle ne mène donc
 * à rien, et le dire est plus utile qu'un lien mort.
 */
function PieceRow({
  line,
  locale,
  showCost,
  labels,
}: {
  line: OrderDetailLine;
  locale: Locale;
  showCost: boolean;
  labels: { size: string; external: string; cost: string; view: string };
}) {
  const unit = line.article_units;

  const details = unit ? (
    <>
      {line.size_snapshot && <span>{`${labels.size} ${line.size_snapshot}`}</span>}
      <bdi>{unit.ref_code}</bdi>
    </>
  ) : (
    <>
      <Store className="size-3 shrink-0" aria-hidden />
      <span>{line.external_source ?? labels.external}</span>
    </>
  );

  const body = (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {line.model_name_snapshot ?? line.external_label}
        </p>
        <p className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
          {details}
        </p>
        {line.line_note && (
          <p className="text-muted-foreground mt-1 text-xs italic">{line.line_note}</p>
        )}
        {/* Le coût payé au confrère sert au bénéfice : il ne regarde que le
            propriétaire, comme les dépenses et le tableau de bord. */}
        {showCost && line.external_cost !== null && (
          <p className="text-muted-foreground mt-1 text-xs">
            {labels.cost} : <span className="tabular">{formatMoney(line.external_cost, locale)}</span>
          </p>
        )}
      </div>

      <span className="tabular shrink-0 text-sm">{formatMoney(line.unit_price, locale)}</span>
      {unit && (
        <ChevronRight
          className="text-muted-foreground size-4 shrink-0 rtl:-scale-x-100"
          aria-hidden
        />
      )}
    </>
  );

  return (
    <li className="border-border border-t first:border-t-0">
      {unit ? (
        <Link
          href={`/stock/${unit.model_id}`}
          title={labels.view}
          className="hover:bg-accent/60 flex min-h-14 items-center gap-3 px-4 py-3 transition-colors"
        >
          {body}
        </Link>
      ) : (
        <div className="flex min-h-14 items-center gap-3 px-4 py-3">{body}</div>
      )}
    </li>
  );
}

function Amount({
  label,
  value,
  strong,
  tone,
  note,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "warning" | "success" | "muted";
  note?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground text-sm">
        {label}
        {note && <span className="text-success ms-2 text-xs">{note}</span>}
      </dt>
      <dd
        className={cn(
          "tabular text-end",
          strong ? "text-base font-medium" : "text-sm",
          tone === "warning" && "text-warning-foreground",
          tone === "success" && "text-success",
          tone === "muted" && "text-muted-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
