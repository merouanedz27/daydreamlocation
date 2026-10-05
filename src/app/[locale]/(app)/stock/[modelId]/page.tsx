import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, Pencil, Plus, Shirt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { ModelRestoreButton } from "@/components/model-danger-zone";
import { getBlockedUnitIds, getModel, isUnitFree } from "@/lib/queries/stock";
import { todayIso } from "@/lib/rental-range";
import { getProfile, canManageStock } from "@/lib/auth";
import { UnitEdit } from "@/components/unit-edit";
import { cn } from "@/lib/utils";
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

const UNIT_STATUS_KEY: Record<string, string> = {
  disponible: "available",
  nettoyage: "cleaning",
  reparation: "repair",
  retire: "retired",
};

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

  const units = [...(model.article_units ?? [])].sort((a, b) =>
    (a.ref_code ?? "").localeCompare(b.ref_code ?? ""),
  );

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
          <p className="tabular mt-2 text-lg font-medium">
            {formatMoney(model.base_price, l)}
          </p>
        </div>
      </div>

      <div className="ornament my-6" aria-hidden>
        <span className="ornament-diamond" />
      </div>

      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg">
          {t("stock.pieces")}{" "}
          <span className="text-muted-foreground tabular text-base font-normal">
            ({units.length})
          </span>
        </h2>
        {canEdit && (
          <Button asChild size="sm" variant="secondary">
            <Link href={`/stock/${model.id}/piece`}>
              <Plus className="size-4" aria-hidden />
              {t("stock.addPiece")}
            </Link>
          </Button>
        )}
      </div>

      {/* Chaque ligne est UNE pièce réelle. C'est le niveau auquel la
          disponibilité se calcule — jamais au niveau du modèle. */}
      <ul className="mt-4 space-y-2">
        {units.map((unit) => {
          const free = isUnitFree(unit, blocked);
          const price = unit.price_override ?? model.base_price;

          return (
            <li
              key={unit.id}
              className={cn(
                "border-border bg-card flex items-center gap-3 rounded-lg border p-3",
                canEdit && "py-1.5 pe-1",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  <bdi>{unit.ref_code}</bdi>
                </p>
                <p className="text-muted-foreground mt-0.5 text-sm">
                  {unit.size && (
                    <>
                      {t("stock.size")}{" "}
                      <span className="tabular text-foreground">{unit.size}</span>
                    </>
                  )}
                  {unit.length_cm && (
                    <span className="tabular"> · {unit.length_cm} cm</span>
                  )}
                </p>
              </div>

              {unit.price_override !== null && (
                <span className="tabular text-sm font-medium">
                  {formatMoney(price, l)}
                </span>
              )}

              <Badge
                className={
                  free
                    ? "bg-success-soft text-success-foreground border-transparent"
                    : unit.status === "disponible"
                      ? "bg-gold-soft text-foreground border-transparent"
                      : "bg-muted text-muted-foreground border-transparent"
                }
              >
                {free
                  ? t("stock.available")
                  : unit.status === "disponible"
                    ? t("stock.reserved")
                    : t(`stock.${UNIT_STATUS_KEY[unit.status]}`)}
              </Badge>

              {canEdit && (
                <UnitEdit
                  unit={{
                    id: unit.id,
                    ref_code: unit.ref_code,
                    size: unit.size,
                    length_cm: unit.length_cm,
                    price_override: unit.price_override,
                  }}
                  categorySlug={model.categories?.slug ?? null}
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
