import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, Pencil, Shirt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { ModelRestoreButton } from "@/components/model-danger-zone";
import { getBlockedUnitIds, getModel, isUnitFree } from "@/lib/queries/stock";
import { todayIso } from "@/lib/rental-range";
import { getProfile, canManageStock } from "@/lib/auth";
import { ModelUnits, type ModelItem, type ModelUnitRow } from "@/components/model-units";
import { PARTS, sortParts, type Part } from "@/lib/stock-refs";
import { formatMoney } from "@/lib/format";
import { photoUrl } from "@/lib/storage";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata(props: {
  params: Promise<{ locale: string; modelId: string }>;
}): Promise<Metadata> {
  const { modelId } = await props.params;
  const model = await getModel(Number(modelId));
  return { title: model?.name_fr ?? "" };
}

export default async function ModelPage({
  params,
}: {
  params: Promise<{ locale: string; modelId: string }>;
}) {
  const { locale, modelId } = await params;
  setRequestLocale(locale);

  const id = Number(modelId);
  if (!Number.isFinite(id)) notFound();

  const [model, profile, blocked] = await Promise.all([
    getModel(id),
    getProfile(),
    getBlockedUnitIds(todayIso()),
  ]);
  if (!model) notFound();

  const l = locale as Locale;
  const t = await getTranslations();
  const canEdit = canManageStock(profile);

  const name = l === "ar" && model.name_ar ? model.name_ar : model.name_fr;
  const category = model.categories
    ? l === "ar"
      ? model.categories.name_ar
      : model.categories.name_fr
    : null;

  // Costume DIVISIBLE : ses parties regroupées sous leur costume
  // (« TUX-A-03 » → veste, pantalon…). Les pièces simples restent seules.
  // Les pièces retirées ne sont plus au stock : elles ne s'affichent pas.
  const allUnits = model.article_units ?? [];
  const parts = sortParts(model.article_model_parts ?? []);
  const groups = new Map<string, ModelItem>();
  for (const unit of allUnits) {
    if (unit.status === "retire") continue;
    const key = unit.set_ref ?? `#${unit.id}`;
    const row: ModelUnitRow = {
      id: unit.id,
      ref: unit.ref_code,
      part: unit.part,
      size: unit.size,
      length_cm: unit.length_cm,
      price_override: unit.price_override,
      status: unit.status,
      free: isUnitFree(unit, blocked),
    };
    const item = groups.get(key) ?? {
      key,
      ref: unit.set_ref ?? unit.ref_code,
      setRef: unit.set_ref,
      size: unit.size?.trim() ?? "",
      free: true,
      units: [],
    };
    item.units.push(row);
    item.free = item.free && row.free;
    // Taille d'un costume = celle de sa veste.
    if (unit.part === "veste") item.size = unit.size?.trim() ?? "";
    groups.set(key, item);
  }
  const items = [...groups.values()].sort((a, b) =>
    a.ref.localeCompare(b.ref, undefined, { numeric: true }),
  );
  for (const item of items) {
    item.units.sort((a, b) => PARTS.indexOf(a.part as Part) - PARTS.indexOf(b.part as Part));
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="-ms-2">
          <Link href="/stock">
            <ArrowLeft className="icon-directional size-4" aria-hidden />
            {t("common.back")}
          </Link>
        </Button>

        {canEdit && (
          <Button asChild variant="outline" className="h-11">
            <Link href={`/stock/${model.id}/modifier`}>
              <Pencil className="size-4" aria-hidden />
              {t("common.edit")}
            </Link>
          </Button>
        )}
      </div>

      {/* Un modèle retiré reste consultable par son adresse — c'est la seule
          façon de le retrouver, et donc de le remettre. La bannière dit
          pourquoi il ne figure plus nulle part ailleurs. */}
      {!model.is_active && (
        <div className="border-border bg-muted mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">{t("stock.archivedBanner")}</p>
            <p className="text-muted-foreground text-sm">
              {t("stock.archivedBannerHint")}
            </p>
          </div>
          {canEdit && <ModelRestoreButton modelId={model.id} />}
        </div>
      )}

      <div className="flex gap-4">
        <div className="bg-muted relative size-24 shrink-0 overflow-hidden rounded-lg sm:size-32">
          {model.photo_path ? (
            <Image
              src={photoUrl(model.photo_path)}
              alt=""
              fill
              sizes="(min-width: 640px) 128px, 96px"
              className="object-cover"
            />
          ) : (
            <span className="text-muted-foreground flex size-full items-center justify-center">
              <Shirt className="size-9" aria-hidden />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="text-2xl leading-tight">{name}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            <bdi>{model.ref_code}</bdi>
            {category && ` · ${category}`}
            {model.color && ` · ${model.color}`}
          </p>
          <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
            <div>
              <dt className="text-muted-foreground text-xs">
                {parts.length ? t("stock.parts.fullPrice") : t("stock.rentalPrice")}
              </dt>
              <dd className="tabular text-lg font-medium">{formatMoney(model.base_price, l)}</dd>
            </div>
            {parts.map((p) => (
              <div key={p.part}>
                <dt className="text-muted-foreground text-xs">{t(`stock.parts.${p.part}`)}</dt>
                <dd className="tabular text-lg font-medium">{formatMoney(p.rent_price, l)}</dd>
              </div>
            ))}
            <div>
              <dt className="text-muted-foreground text-xs">{t("stock.purchasePriceModel")}</dt>
              <dd className="tabular text-lg font-medium">
                {formatMoney(model.purchase_price, l)}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="ornament my-6" aria-hidden>
        <span className="ornament-diamond" />
      </div>

      {/* Chaque article est UNE pièce réelle (ou un costume) : c'est le niveau
          auquel la disponibilité se calcule. L'écran, lui, les compte par
          taille. */}
      <ModelUnits
        modelId={model.id}
        refCode={model.ref_code}
        categorySlug={model.categories?.slug ?? null}
        parts={parts.map((p) => p.part as Part)}
        items={items}
        existingRefs={allUnits.map((u) => u.ref_code)}
        canEdit={canEdit}
      />
    </div>
  );
}
