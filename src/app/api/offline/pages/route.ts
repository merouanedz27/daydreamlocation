import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProfile, isOwner } from "@/lib/auth";
import { addDays, todayIso } from "@/lib/rental-range";
import { routing, type Locale } from "@/i18n/routing";

/** Les fiches commande gardées au plus — chacune est un rendu serveur. */
const MAX_DETAILS = 30;

/**
 * Les écrans que le téléphone garde pour le hors ligne (`lib/offline/pages.ts`).
 *
 *   - `pages`   : les écrans du quotidien — ceux de la barre basse, la saisie,
 *                 le calendrier, le stock ; le tableau de bord pour le
 *                 propriétaire ;
 *   - `details` : les fiches des commandes qu'on aura en main sans réseau —
 *                 retraits d'aujourd'hui et demain, tenues sorties pas encore
 *                 rentrées. C'est là qu'on encaisse le reste.
 *
 * La RLS s'applique : un employé ne reçoit que ce qu'il lit déjà.
 */
export async function GET(request: NextRequest) {
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const asked = request.nextUrl.searchParams.get("locale");
  const locale: Locale = routing.locales.includes(asked as Locale)
    ? (asked as Locale)
    : routing.defaultLocale;
  const at = (path: string) => `/${locale}${path}`;

  const pages = [
    "/commandes",
    "/commandes/demain",
    "/commandes/pas-rentres",
    "/commandes/impayes",
    "/commandes/nouvelle",
    "/commandes/calendrier",
    "/pointage",
    "/frais",
    "/pressing",
    "/pressing/en-cours",
    "/stock",
    ...(isOwner(profile) ? ["/tableau-de-bord"] : []),
  ].map(at);

  const today = todayIso();
  const tomorrow = addDays(today, 1);
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select("id")
    .neq("status", "annulee")
    .or(
      `and(picked_up.eq.false,pickup_date.lte.${tomorrow},event_date.gte.${today}),and(picked_up.eq.true,returned.eq.false)`,
    )
    .order("pickup_date")
    .limit(MAX_DETAILS);

  const details = (data ?? []).map((o) => at(`/commandes/${o.id}`));
  return NextResponse.json({ pages, details }, { headers: { "Cache-Control": "private, no-store" } });
}
