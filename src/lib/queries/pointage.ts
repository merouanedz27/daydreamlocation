import { createClient } from "@/lib/supabase/server";
import { daysDue, periodStart, type PayReset, type WorkerPeriod } from "@/lib/pointage";
import type { IsoDate } from "@/lib/rental-range";

/** Combien de paies passées on garde à l'écran. */
const HISTORY = 3;

type Person = { id: string; full_name: string; work_start_date: IsoDate | null };

/** Jours d'un mois de paie complet (`settings.pay_month_days`). */
export async function getPayMonthDays(): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("settings").select("pay_month_days").maybeSingle();
  if (error) throw error;
  return data?.pay_month_days ?? 30;
}

/**
 * La période ouverte de chaque personne : ses absences depuis sa dernière
 * paie, ses jours dus et payables, et ses dernières paies.
 *
 * Aucun filtre de personne pour la sécurité : la RLS ne rend à un employé que
 * SES lignes, au propriétaire celles de toute l'équipe. Deux requêtes pour
 * toute l'équipe, pas une par personne.
 */
async function periodsFor(people: Person[], today: IsoDate): Promise<WorkerPeriod[]> {
  if (!people.length) return [];
  const supabase = await createClient();
  const ids = people.map((p) => p.id);

  const [monthDays, resetsResult] = await Promise.all([
    getPayMonthDays(),
    supabase
      .from("pay_resets")
      .select(
        "user_id, paid_through, days_count, daily_rate, amount, monthly_salary, month_days, absences_count, created_at",
      )
      .in("user_id", ids)
      .order("paid_through", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);
  if (resetsResult.error) throw resetsResult.error;

  const byUser = new Map<string, PayReset[]>();
  for (const r of resetsResult.data ?? []) {
    byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r]);
  }

  const starts = new Map(
    people.map((p) => [
      p.id,
      periodStart(byUser.get(p.id)?.[0]?.paid_through ?? null, p.work_start_date, today),
    ]),
  );
  const earliest = [...starts.values()].sort()[0];

  const { data: absences, error: absencesError } = await supabase
    .from("absences")
    .select("user_id, day")
    .in("user_id", ids)
    .gte("day", earliest)
    .lte("day", today)
    .order("day");
  if (absencesError) throw absencesError;

  return people.map((person) => {
    const start = starts.get(person.id)!;
    const own = (absences ?? [])
      .filter((a) => a.user_id === person.id && a.day >= start)
      .map((a) => a.day);
    const due = daysDue(start, today, monthDays);
    return {
      id: person.id,
      full_name: person.full_name,
      start,
      workStartDate: person.work_start_date,
      absences: own,
      due,
      worked: Math.max(due - own.length, 0),
      resets: (byUser.get(person.id) ?? []).slice(0, HISTORY),
    };
  });
}

export async function getMyPeriod(personId: string, today: IsoDate): Promise<WorkerPeriod> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, work_start_date")
    .eq("id", personId)
    .single();
  if (error) throw error;
  const [period] = await periodsFor([data], today);
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
    .select("id, full_name, work_start_date")
    .eq("is_active", true)
    .neq("role", "owner")
    .order("full_name");
  if (error) throw error;
  return periodsFor(data ?? [], today);
}
