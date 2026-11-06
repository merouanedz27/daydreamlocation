import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PrintToolbar } from "@/components/print-toolbar";
import { TicketFrame } from "@/components/ticket-fit";
import { TicketPdfProvider } from "@/components/ticket-pdf";
import { AlterationLabel } from "@/components/alteration-label";
import { AlterationLabelsActions } from "@/components/alteration-board";
import { appUrl } from "@/lib/email/send";
import { alterationUrl, isUuid } from "@/lib/alteration-url";
import { getAlteration, listAlterations, type Alteration } from "@/lib/queries/alterations";
import { formatDate } from "@/lib/format";
import type { Locale } from "@/i18n/routing";

/** 2 colonnes × 5 rangées : 10 étiquettes par feuille 4 × 6 pouces. */
const PER_SHEET = 10;

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "alterations" });
  return { title: t("labelsTitle") };
}

/**
 * Les ÉTIQUETTES RETOUCHE : 10 par feuille 4 × 6 pouces, à découper et coller
 * sur chaque vêtement qui part chez le tailleur. Chacune porte le QR de SA
 * retouche, le client, le NOM de la pièce (« Veste », pour distinguer les
 * étiquettes d'un même client), la taille, la date et ce qu'il faut faire —
 * jamais la référence (demande du client).
 *
 * Quelles étiquettes :
 *   ?commande=<id>   celles d'une commande (fiche commande) ;
 *   ?ids=a,b         une sélection (réimpression d'une seule) ;
 *   ?nouvelles=1     les pièces à faire jamais imprimées ;
 *   (rien)           toutes les pièces à faire.
 *
 * Même chaîne que le bon de location : chaque feuille est PHOTOGRAPHIÉE
 * (`TicketPdfProvider`) — l'arabe d'un nom de client garde sa police, ce que
 * pdf-lib seul ne sait pas faire.
 */
export default async function AlterationLabelsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ commande?: string; ids?: string; nouvelles?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;
  const query = await searchParams;

  const [t, pending] = await Promise.all([
    getTranslations("alterations"),
    listAlterations("a_faire"),
  ]);

  let items: Alteration[];
  if (query.ids) {
    const ids = [...new Set(query.ids.split(",").filter(isUuid))].slice(0, 200);
    const known = new Map(pending.map((a) => [a.id, a]));
    items = (
      await Promise.all(ids.map(async (id) => known.get(id) ?? (await getAlteration(id))))
    ).filter((a): a is Alteration => a !== null);
  } else if (query.commande) {
    items = pending.filter((a) => a.order_id === Number(query.commande));
  } else if (query.nouvelles) {
    items = pending.filter((a) => !a.printed_at);
  } else {
    items = pending;
  }

  const backHref = query.commande ? `/commandes/${query.commande}` : "/retouches";
  const sheets: Alteration[][] = [];
  for (let i = 0; i < items.length; i += PER_SHEET) sheets.push(items.slice(i, i + PER_SHEET));
  const origin = appUrl();

  return (
    <TicketPdfProvider fileName={`${t("labelsTitle")} ${formatDate(new Date(), l)}`}>
      <PrintToolbar
        backHref={backHref}
        printButton={false}
        action={items.length ? <AlterationLabelsActions ids={items.map((a) => a.id)} /> : undefined}
        hint={items.length ? t("labelsHint", { count: items.length }) : undefined}
      />
      <style>{"@page { size: 4in 6in; margin: 0; }"}</style>

      {items.length === 0 ? (
        <p className="bg-card mx-auto max-w-sm rounded-lg border p-4 text-center text-sm print:hidden">
          {t("labelsEmpty")}
        </p>
      ) : (
        <div className="space-y-4 print:space-y-0">
          {sheets.map((sheet, index) => (
            <TicketFrame
              key={index}
              index={index}
              frameClassName={index > 0 ? "print:break-before-page" : undefined}
            >
              {/* Hauteur FIXE (la feuille moins ses 2 × 5 mm) et tailles en pt :
                  l'ajustement automatique du bon ne joue pas ici, chaque
                  case garde sa place. */}
              <div className="grid h-[calc(6in-10mm-6px)] grid-cols-2 grid-rows-5 border-s border-t border-dashed border-neutral-400">
                {Array.from({ length: PER_SHEET }, (_, i) => sheet[i] ?? null).map((item, i) => (
                  <div
                    key={item?.id ?? `empty-${i}`}
                    className="flex min-h-0 min-w-0 flex-col justify-center overflow-hidden border-e border-b border-dashed border-neutral-400 p-[1.5mm]"
                  >
                    {item && (
                      <AlterationLabel
                        url={alterationUrl(origin, locale, item.id)}
                        customerName={item.customer_name}
                        modelName={item.model_name}
                        sizeLabel={item.size ? t("size", { size: item.size }) : null}
                        eventDate={item.event_date}
                        note={item.note}
                        locale={l}
                      />
                    )}
                  </div>
                ))}
              </div>
            </TicketFrame>
          ))}
        </div>
      )}
    </TicketPdfProvider>
  );
}
