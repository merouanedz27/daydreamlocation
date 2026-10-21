"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ClipboardList, Plus, WifiOff } from "lucide-react";
import { OrderQuickForm } from "@/components/order-quick-form";
import { getCatalog, getSnapshot, setOfflineContext } from "@/lib/offline/outbox";
import type { OfflineCatalog, OfflineSnapshot } from "@/lib/offline/types";
import { draftFromOrder } from "@/lib/quick-draft";
import { defaultWindow } from "@/lib/rental-range";
import { normalizeSearch } from "@/lib/search";
import { formatDayMonth, formatTime } from "@/lib/format";
import type { Locale } from "@/i18n/routing";

/**
 * L'identifiant de la commande à modifier. Servie par le service worker à la
 * place de \`/fr/commandes/12/modifier\`, la page garde CETTE adresse : on la
 * relit. Ouverte directement, elle porte \`?id=12\`.
 */
function orderIdFromLocation(): number | null {
  const url = new URL(window.location.href);
  const fromQuery = Number(url.searchParams.get("id"));
  if (Number.isInteger(fromQuery) && fromQuery > 0) return fromQuery;
  const match = /\/commandes\/(\d+)\/modifier/.exec(url.pathname);
  return match ? Number(match[1]) : null;
}

type Loaded = { catalog: OfflineCatalog | null; snapshot: OfflineSnapshot | null; orderId: number | null };

/**
 * Le formulaire de commande SANS RÉSEAU — le même que d'habitude, nourri par
 * ce que le téléphone a gardé : le stock, les clients, les réglages et les
 * réservations (catalogue), et pour une modification la commande elle-même
 * (cliché).
 *
 * Tout ce qui s'y enregistre est PROVISOIRE : le formulaire le dit, la
 * commande attend dans la file, et la base la confirme ou la refuse au retour
 * du réseau.
 */
export function OfflineOrderForm({ locale, mode }: { locale: Locale; mode: "new" | "edit" }) {
  const t = useTranslations();
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([getCatalog(), getSnapshot()]).then(([catalog, snapshot]) => {
      if (!alive) return;
      const owner = catalog?.userId ?? snapshot?.userId;
      if (owner) setOfflineContext({ userId: owner, locale });
      setLoaded({
        catalog: catalog ?? null,
        snapshot: snapshot ?? null,
        orderId: mode === "edit" ? orderIdFromLocation() : null,
      });
    });
    return () => {
      alive = false;
    };
  }, [locale, mode]);

  return (
    <>
      <main className="mx-auto w-full max-w-2xl px-4 pt-6 pb-24">
        {loaded && <Body loaded={loaded} locale={locale} mode={mode} />}
      </main>

      {/* Même hauteur que la barre basse de l'application : la barre
          « Enregistrer » du formulaire vient se poser juste au-dessus. */}
      <nav className="border-nav-border bg-nav text-nav-foreground pb-safe fixed inset-x-0 bottom-0 z-40 border-t">
        <div className="mx-auto grid h-14 max-w-2xl grid-cols-2">
          <a href={`/${locale}/hors-ligne`} className="flex items-center justify-center gap-2 text-sm">
            <ClipboardList className="size-4" aria-hidden />
            {t("offline.viewerLink")}
          </a>
          <a href={`/${locale}/hors-ligne/nouvelle`} className="flex items-center justify-center gap-2 text-sm">
            <Plus className="size-4" aria-hidden />
            {t("offline.newOrder")}
          </a>
        </div>
      </nav>
    </>
  );
}

function Body({ loaded, locale, mode }: { loaded: Loaded; locale: Locale; mode: "new" | "edit" }) {
  const t = useTranslations();
  const { catalog, snapshot, orderId } = loaded;

  if (!catalog) {
    return (
      <div className="text-center">
        <WifiOff className="text-muted-foreground mx-auto size-7" aria-hidden />
        <p className="text-muted-foreground mt-3 text-sm">{t("offline.noCatalog")}</p>
      </div>
    );
  }

  const header = (
    <p className="text-muted-foreground mb-3 text-xs">
      {t("offline.catalogOf", {
        date: formatDayMonth(catalog.syncedAt, locale),
        time: formatTime(catalog.syncedAt, locale),
      })}
    </p>
  );

  if (mode === "new") {
    return (
      <>
        {header}
        <OrderQuickForm
          models={catalog.models}
          items={catalog.items}
          customers={catalog.customers}
          settings={catalog.settings}
        />
      </>
    );
  }

  const order = snapshot?.orders.find((o) => o.id === orderId);
  if (!order) {
    return <p className="text-muted-foreground text-center text-sm">{t("offline.orderNotKept")}</p>;
  }

  // Comme la page « Modifier » en ligne : chaque pièce retrouve sa case.
  const labelSlots = new Map(catalog.labelSlots);
  const categoryByUnit = new Map<number, string | null>();
  for (const model of catalog.models) {
    for (const unit of model.units) categoryByUnit.set(unit.id, unit.part ?? model.category_slug);
  }
  const initial = draftFromOrder(
    { ...order, order_lines: order.editLines },
    {
      slotOf: (label) => labelSlots.get(normalizeSearch(label)) ?? null,
      categoryOfUnit: (unitId) => categoryByUnit.get(unitId) ?? null,
      defaultWindow: defaultWindow(
        order.event_date,
        catalog.settings.days_before_event,
        catalog.settings.days_after_event,
      ),
    },
  );

  return (
    <>
      {header}
      <OrderQuickForm
        models={catalog.models}
        items={catalog.items}
        customers={catalog.customers}
        settings={catalog.settings}
        edit={{ orderId: order.id, orderNo: order.order_no, initial, version: order.version }}
      />
    </>
  );
}
