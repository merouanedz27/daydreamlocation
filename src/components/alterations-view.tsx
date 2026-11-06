import { getTranslations } from "next-intl/server";
import { CircleCheck, Printer, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlterationList,
  AlterationScanButton,
  AlterationTabs,
} from "@/components/alteration-board";
import { Link } from "@/i18n/navigation";
import {
  DONE_WINDOW_DAYS,
  listAlterations,
  type AlterationStatus,
} from "@/lib/queries/alterations";
import { matchesSearch } from "@/lib/search";

/**
 * La liste des retouches — la MÊME page pour l'atelier du tailleur
 * (`/atelier`) et pour le magasin (`/retouches`). Le magasin voit en plus
 * l'impression des étiquettes, le lien vers chaque commande et l'annulation
 * d'un scan.
 */
export async function AlterationsView({
  mode,
  status,
  q = "",
}: {
  mode: "tailor" | "staff";
  status: AlterationStatus;
  /**
   * La recherche de l'en-tête (`?q=`) : client, retouche, pièce, référence,
   * taille, n° de commande. Filtrée EN MÉMOIRE — la liste est courte et déjà
   * chargée en entier. La référence n'est plus affichée mais reste cherchable.
   */
  q?: string;
}) {
  const base = mode === "tailor" ? "/atelier" : "/retouches";
  const [t, pending, done] = await Promise.all([
    getTranslations("alterations"),
    listAlterations("a_faire"),
    status === "taillee" ? listAlterations("taillee") : Promise.resolve(null),
  ]);
  const all = status === "a_faire" ? pending : (done ?? []);
  const items = all.filter((a) =>
    matchesSearch(q, a.customer_name, a.note, a.model_name, a.ref_code, a.size, a.order_no),
  );
  const unprinted = pending.filter((a) => !a.printed_at).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl">{t(mode === "tailor" ? "atelierTitle" : "title")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t(mode === "tailor" ? "atelierHint" : "hint")}
        </p>
      </div>

      <AlterationScanButton />

      {mode === "staff" && pending.length > 0 && (
        <Button asChild variant="outline" className="h-12 w-full gap-2">
          <Link href={unprinted ? "/imprimer/retouches?nouvelles=1" : "/imprimer/retouches"}>
            <Printer className="size-5" aria-hidden />
            {unprinted
              ? t("printNew", { count: unprinted })
              : t("printAll", { count: pending.length })}
          </Link>
        </Button>
      )}

      <AlterationTabs base={base} pending={pending.length} done={done?.length ?? null} />

      {items.length === 0 && all.length > 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-10 text-center text-sm">
          {t("noResults", { q })}
        </p>
      ) : items.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-10 text-center text-sm">
          {status === "a_faire" ? (
            <Scissors className="size-8" aria-hidden />
          ) : (
            <CircleCheck className="size-8" aria-hidden />
          )}
          {status === "a_faire" ? t("emptyPending") : t("emptyDone", { days: DONE_WINDOW_DAYS })}
        </div>
      ) : (
        <AlterationList items={items} mode={mode} />
      )}
    </div>
  );
}
