import { getTranslations, setRequestLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { formatDate, formatMoney } from "@/lib/format";
import type { Locale } from "@/i18n/routing";

/**
 * Écran de vérification du socle (phase 1) : palette, typographie, RTL,
 * formatage des montants et des dates. Sera remplacé par la liste des
 * commandes une fois l'authentification en place.
 */
export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations();
  const l = locale as Locale;
  const sampleDate = new Date("2026-08-26T12:00:00Z");

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl">{t("app.name")}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t("app.tagline")}
          </p>
        </div>
        <LocaleSwitcher />
      </header>

      <div className="ornament my-8">
        <span className="ornament-diamond" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{t("orders.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label={t("orders.eventDate")}>
              <span className="tabular">{formatDate(sampleDate, l)}</span>
            </Row>
            <Row label={t("orders.total")}>
              <span className="tabular">{formatMoney(7000, l)}</span>
            </Row>
            <Row label={t("orders.paid")}>
              <span className="tabular">{formatMoney(3000, l)}</span>
            </Row>
            <Row label={t("orders.balance")}>
              <span className="tabular text-warning-foreground font-medium">
                {formatMoney(4000, l)}
              </span>
            </Row>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{t("stock.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Gio-079-01">
              <Badge className="bg-success-soft text-success-foreground border-transparent">
                {t("stock.available")}
              </Badge>
            </Row>
            <Row label="Gio-079-02">
              <Badge className="bg-gold-soft text-foreground border-transparent">
                {t("stock.reserved")}
              </Badge>
            </Row>
            <Row label="TK-405-01">
              <Badge className="bg-warning-soft text-warning-foreground border-transparent">
                {t("stock.cleaning")}
              </Badge>
            </Row>
            <Row label={t("stock.size")}>
              <span className="tabular">50 / 52</span>
            </Row>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
