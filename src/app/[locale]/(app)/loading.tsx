import { Skeleton } from "@/components/ui/skeleton";
import { ListSkeleton } from "@/components/list-skeleton";

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
      <ListSkeleton />
    </div>
  );
}
