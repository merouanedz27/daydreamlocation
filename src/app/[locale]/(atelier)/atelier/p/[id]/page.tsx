import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronLeft, Scissors } from "lucide-react";
import { MarkAlteredButton } from "@/components/alteration-board";
import { Link } from "@/i18n/navigation";
import { getAlteration } from "@/lib/queries/alterations";
import { formatDate } from "@/lib/format";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "alterations" });
  return { title: t("atelierTitle") };
}

/**
 * Une étiquette scannée avec l'APPAREIL PHOTO du téléphone (et non dans
 * l'application) : le QR est une URL, elle ouvre cette page. La pièce, sa
 * retouche, et un seul bouton — rien ne change tant qu'on ne l'a pas touché.
 */
export default async function AlterationLabelPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const [t, item] = await Promise.all([getTranslations("alterations"), getAlteration(id)]);

  const back = (
    <Link
      href="/atelier"
      className="text-muted-foreground hover:text-foreground -ms-2 mb-4 inline-flex min-h-11 items-center gap-1 px-2 text-sm"
    >
      <ChevronLeft className="size-4 rtl:-scale-x-100" aria-hidden />
      {t("backToList")}
    </Link>
  );

  if (!item) {
    return (
      <div>
        {back}
        <p className="border-border bg-muted rounded-lg border p-4">{t("errors.unknownLabel")}</p>
      </div>
    );
  }

  // Le nom de la pièce seul, sans sa référence.
  const piece = item.model_name ?? "";

  return (
    <div>
      {back}
      <div className="bg-card border-border space-y-3 rounded-lg border p-4">
        <div>
          <p className="text-lg font-medium">
            <bdi>{item.customer_name}</bdi>
          </p>
          <p className="text-muted-foreground text-sm">
            <bdi>{piece}</bdi>
            {item.size && ` · ${t("size", { size: item.size })}`}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            {t("eventOn", { date: formatDate(item.event_date, locale as Locale) })}
          </p>
        </div>
        <p className="bg-gold-soft/50 flex items-start gap-2 rounded-md px-3 py-2.5 text-lg">
          <Scissors className="text-gold-strong mt-1.5 size-4 shrink-0" aria-hidden />
          <bdi className="min-w-0 break-words">{item.note}</bdi>
        </p>
        <MarkAlteredButton id={item.id} done={item.status === "taillee"} />
      </div>
    </div>
  );
}
