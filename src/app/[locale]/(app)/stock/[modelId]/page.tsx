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
import { SetDelete } from "@/components/set-delete";
import { PARTS, type Part } from "@/lib/stock-refs";
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
  type Unit = (typeof units)[number];

  // Costume DIVISIBLE : ses parties regroupées sous leur costume
  // (« TUX-A-03 » → veste, pantalon…). Les pièces simples restent seules.
  const parts = [...(model.article_model_parts ?? [])].sort(
    (a, b) => PARTS.indexOf(a.part as Part) - PARTS.indexOf(b.part as Part),
  );
  const groups: { setRef: string | null; units: Unit[] }[] = [];
  for (const unit of units) {
    const group = unit.set_ref ? groups.find((g) => g.setRef === unit.set_ref) : undefined;
    if (group) group.units.push(unit);
    else groups.push({ setRef: unit.set_ref, units: [unit] });
  }
  for (const group of groups) {
    group.units.sort(
      (a, b) => PARTS.indexOf(a.part as Part) - PARTS.indexOf(b.part as Part),
    );
  }
  const setCount = groups.filter((g) => g.setRef).length;
  const liveSets = groups.filter(
    (g) => g.setRef && g.units.some((u) => u.status !== "retire"),
  );
  const freeSets = liveSets.filter((g) => g.units.every((u) => isUnitFree(u, blocked))).length;

  const unitBody = (unit: Unit) => {
    const free = isUnitFree(unit, blocked);
    const price = unit.price_override ?? model.base_price;
    return (
      <>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {unit.part && <span className="me-1.5">{t(`stock.parts.${unit.part}`)}</span>}
            <bdi className={cn(unit.part && "text-muted-foreground font-normal")}>
              {unit.ref_code}
            </bdi>
          </p>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {unit.size && (
              <>
                {t("stock.size")}{" "}
                <span className="tabular text-foreground">{unit.size}</span>
              </>
            )}
            {unit.length_cm && <span className="tabular"> · {unit.length_cm} cm</span>}
          </p>
        </div>

        {unit.price_override !== null && (
          <span className="tabular text-sm font-medium">{formatMoney(price, l)}</span>
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
            categorySlug={unit.part ?? model.categories?.slug ?? null}
          />
        )}
      </>
    );
  };

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

      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg">
            {setCount ? t("stock.parts.costumes") : t("stock.pieces")}{" "}
            <span className="text-muted-foreground tabular text-base font-normal">
              ({setCount || units.length})
            </span>
          </h2>
          {setCount > 0 && (
            <p className="text-muted-foreground text-sm">
              {t("stock.parts.completeFree", { count: freeSets, n: String(freeSets) })}
            </p>
          )}
        </div>
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
          disponibilité se calcule — jamais au niveau du modèle. Les parties
          d'un costume sont rangées sous lui : chacune se loue seule. */}
      <ul className="mt-4 space-y-2">
        {groups.map((group) =>
          group.setRef ? (
            <li key={group.setRef} className="border-border bg-card rounded-lg border">
              <div className="border-border flex items-center gap-2 border-b py-1 ps-3 pe-1">
                <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                  <bdi>{group.setRef}</bdi>
                </p>
                {canEdit && <SetDelete modelId={model.id} setRef={group.setRef} />}
              </div>
              <ul className="divide-border divide-y">
                {group.units.map((unit) => (
                  <li
                    key={unit.id}
                    className={cn("flex items-center gap-3 p-3", canEdit && "py-1.5 pe-1")}
                  >
                    {unitBody(unit)}
                  </li>
                ))}
              </ul>
            </li>
          ) : (
            group.units.map((unit) => (
              <li
                key={unit.id}
                className={cn(
                  "border-border bg-card flex items-center gap-3 rounded-lg border p-3",
                  canEdit && "py-1.5 pe-1",
                )}
              >
                {unitBody(unit)}
              </li>
            ))
          ),
        )}
      </ul>
    </div>
  );
}
