import { Skeleton } from "@/components/ui/skeleton";

/**
 * Affiché DÈS le toucher, pendant que le serveur prépare la page : sans lui,
 * l'écran restait figé sur l'ancienne page jusqu'à la réponse complète, et
 * l'appli paraissait ne pas avoir entendu le doigt. L'en-tête et la barre
 * d'onglets (le layout) restent en place ; seul le contenu attend.
 */
export default function Loading() {
  return (
    <div aria-busy className="space-y-4">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-10 w-full" />
      <div className="border-border divide-border divide-y rounded-lg border">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex min-h-14 items-center gap-3 px-3 py-2">
            <Skeleton className="size-5 shrink-0 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
