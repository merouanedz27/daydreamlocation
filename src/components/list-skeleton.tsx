import { Skeleton } from "@/components/ui/skeleton";

/**
 * Des lignes grises à la place d'une liste qui arrive : l'écran de chargement
 * des pages (`loading.tsx`) et la liste des commandes, rendue en flux derrière
 * ses boutons et ses filtres.
 */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-busy className="border-border divide-border divide-y rounded-lg border">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex min-h-14 items-center gap-3 px-3 py-2">
          <Skeleton className="size-5 shrink-0 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}
