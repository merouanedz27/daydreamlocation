import { createClient } from "@/lib/supabase/server";
import {
  asPayType,
  calendarDays,
  periodStart,
  workedDays,
  type PayReset,
  type WorkerPeriod,
} from "@/lib/pointage";
import type { IsoDate } from "@/lib/rental-range";

/** Combien de paies passées on garde à l'écran. */
const HISTORY = 3;

type Person = {
  id: string;
  full_name: string;
  work_start_date: IsoDate | null;
  pay_type: string;
  daily_rate: number | null;
};

/**
 * La période ouverte de chaque personne : ses cases cochées depuis sa
 * dernière paie — absences d'un permanent, présences d'un remplaçant —, ses
 * jours payables et ses dernières paies.
 *
 * Aucun filtre de personne pour la sécurité : la RLS ne rend à un employé que
 * SES lignes, au propriétaire celles de toute l'équipe. Trois requêtes pour
 * toute l'équipe, pas une par personne.
 */
async function periodsFor(people: Person[], today: IsoDate): Promise<WorkerPeriod[]> {
  if (!people.length) return [];
  const supabase = await createClient();
  const ids = people.map((p) => p.id);

  const { data: resets, error: resetsError } = await supabase
    .from("pay_resets")
    .select(
      "user_id, paid_through, days_count, daily_rate, amount, absences_count, presences_count, pay_type, created_at",
    )
    .in("user_id", ids)
    .order("paid_through", { ascending: false })
    .order("created_at", { ascending: false });
  if (resetsError) throw resetsError;

  const byUser = new Map<string, PayReset[]>();
  for (const r of resets ?? []) {
    byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r]);
  }

  const starts = new Map(
    people.map((p) => [
      p.id,
      periodStart(byUser.get(p.id)?.[0]?.paid_through ?? null, p.work_start_date, today),
    ]),
  );
  const earliest = [...starts.values()].sort()[0];

  // Les deux tables en parallèle : chaque personne ne lit que celle de son type.
  const [absences, presences] = await Promise.all([
    supabase
      .from("absences")
      .select("user_id, day")
      .in("user_id", ids)
      .gte("day", earliest)
      .lte("day", today)
      .order("day"),
    supabase
      .from("presences")
      .select("user_id, day")
      .in("user_id", ids)
      .gte("day", earliest)
      .lte("day", today)
      .order("day"),
  ]);
  if (absences.error) throw absences.error;
  if (presences.error) throw presences.error;

  return people.map((person) => {
    const payType = asPayType(person.pay_type);
    const start = starts.get(person.id)!;
    const rows = (payType === "remplacant" ? presences.data : absences.data) ?? [];
    const marks = rows.filter((m) => m.user_id === person.id && m.day >= start).map((m) => m.day);
    return {
      id: person.id,
      full_name: person.full_name,
      payType,
      dailyRate: person.daily_rate === null ? null : Number(person.daily_rate),
      start,
      workStartDate: person.work_start_date,
      marks,
      due: calendarDays(start, today),
      worked: workedDays(payType, start, today, marks.length),
      resets: (byUser.get(person.id) ?? []).slice(0, HISTORY),
    };
  });
}

/**
 * La période de l'utilisateur connecté. Reçoit son profil, déjà lu par le
 * layout (`getProfile`) : pas de second aller-retour vers `profiles`.
 */
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
    .select("id, full_name, work_start_date, pay_type, daily_rate")
    .eq("is_active", true)
    .neq("role", "owner")
    .order("full_name");
  if (error) throw error;
  return periodsFor(data ?? [], today);
}
