import { createClient } from "@/lib/supabase/server";
import { isShift, periodStart, slotKey, type PayReset, type WorkerPeriod } from "@/lib/pointage";
import type { IsoDate } from "@/lib/rental-range";

/** Combien de paies passées on garde à l'écran. */
const HISTORY = 3;

type Person = { id: string; full_name: string };

/**
 * La période ouverte de chaque personne : ses cases depuis sa dernière paie,
 * et ses dernières paies.
 *
 * Aucun filtre de personne pour la sécurité : la RLS ne rend à un employé que
 * SES lignes, au propriétaire celles de toute l'équipe. Deux requêtes pour
 * toute l'équipe, pas une par personne.
 */
async function periodsFor(people: Person[], today: IsoDate): Promise<WorkerPeriod[]> {
  if (!people.length) return [];
  const supabase = await createClient();
  const ids = people.map((p) => p.id);

  const { data: resets, error: resetsError } = await supabase
    .from("pay_resets")
    .select("user_id, paid_through, days_count, daily_rate, amount, created_at")
    .in("user_id", ids)
    .order("paid_through", { ascending: false })
    .order("created_at", { ascending: false });
  if (resetsError) throw resetsError;

  const byUser = new Map<string, PayReset[]>();
  for (const r of resets ?? []) {
    byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r]);
  }

  // Les cases postérieures à la paie la plus ancienne encore utile : on
  // filtre ensuite par personne. Sans paie, tout (la table reste petite).
  const lastPaid = people.map((p) => byUser.get(p.id)?.[0]?.paid_through ?? null);
  const oldestPaid = lastPaid.includes(null) ? null : (lastPaid as IsoDate[]).sort()[0];

  let request = supabase.from("attendance").select("user_id, day, shift").in("user_id", ids);
  if (oldestPaid) request = request.gt("day", oldestPaid);
  const { data: days, error: daysError } = await request.order("day");
  if (daysError) throw daysError;

  return people.map((person) => {
    const own = byUser.get(person.id) ?? [];
    const paidThrough = own[0]?.paid_through ?? null;
    const open = (days ?? []).filter(
      (d) => d.user_id === person.id && (!paidThrough || d.day > paidThrough) && d.day <= today,
    );
    const checked = open.flatMap((d) => (isShift(d.shift) ? [slotKey(d.day, d.shift)] : []));
    return {
      id: person.id,
      full_name: person.full_name,
      start: periodStart(paidThrough, open[0]?.day ?? null, today),
      checked,
      resets: own.slice(0, HISTORY),
    };
  });
}

export async function getMyPeriod(person: Person, today: IsoDate): Promise<WorkerPeriod> {
  const [period] = await periodsFor([person], today);
  return period;
}

/**
 * L'équipe du propriétaire : employés et modérateurs actifs — pas les
 * administrateurs, qui ne pointent pas. `profiles_read` ne montre toutes les
 * lignes qu'à un administrateur.
 */
export async function getTeamPeriods(today: IsoDate): Promise<WorkerPeriod[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("is_active", true)
    .neq("role", "owner")
    .order("full_name");
  if (error) throw error;
  return periodsFor(data ?? [], today);
}
