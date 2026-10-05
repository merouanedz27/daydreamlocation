/**
 * La version DÉPLOYÉE de l'application — comparée par `UpdateNotifier` à celle
 * que le téléphone a chargée. Une application installée reste ouverte des
 * jours : sans ça, l'équipe garderait l'ancien code après chaque mise en ligne.
 *
 * Rien de sensible : un identifiant de build (empreinte du commit).
 */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { build: process.env.NEXT_PUBLIC_BUILD_ID ?? null },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
