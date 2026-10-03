import "server-only";
import { createClient } from "@/lib/supabase/server";
import { lastWeeks, weekStart } from "@/lib/weeks";

const DAY = 86_400_000;

export async function getPerformance(cohortId: string | null, now = Date.now()) {
  const supabase = await createClient();
  const since30 = new Date(now - 30 * DAY).toISOString();
  const since8w = new Date(now - 8 * 7 * DAY).toISOString();
  const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;

  const [{ data: cohorts }, { data: recent }, sales30, free30, refunds30, { data: freeLeads }, { data: buyers }] = await Promise.all([
    supabase.rpc("cohort_stats"),
    supabase.from("enrollments").select("origin, created_at").in("origin", ["purchase", "free"]).gte("created_at", since8w).limit(50_000),
    count(supabase.from("enrollments").select("id", { count: "exact", head: true }).eq("origin", "purchase").gte("created_at", since30)),
    count(supabase.from("enrollments").select("id", { count: "exact", head: true }).eq("origin", "free").gte("created_at", since30)),
    count(supabase.from("enrollments").select("id", { count: "exact", head: true }).eq("status", "refunded").gte("updated_at", since30)),
    supabase.from("enrollments").select("user_id, created_at").eq("origin", "free").limit(50_000),
    supabase.from("enrollments").select("user_id, created_at").eq("origin", "purchase").limit(50_000),
  ]);

  const weeks = lastWeeks(8, now);
  const weekly = (origin: string) => {
    const byWeek = new Map<string, number>();
    for (const e of recent ?? [])
      if (e.origin === origin) byWeek.set(weekStart(e.created_at), (byWeek.get(weekStart(e.created_at)) ?? 0) + 1);
    return weeks.map((w) => ({ label: w.label, value: byWeek.get(w.key) ?? 0 }));
  };

  // Conversão: leads grátis que depois compraram algum curso.
  const firstPurchase = new Map<string, string>();
  for (const b of buyers ?? [])
    if (!firstPurchase.has(b.user_id) || b.created_at < firstPurchase.get(b.user_id)!) firstPurchase.set(b.user_id, b.created_at);
  const leads = new Map<string, string>();
  for (const l of freeLeads ?? []) if (!leads.has(l.user_id) || l.created_at < leads.get(l.user_id)!) leads.set(l.user_id, l.created_at);
  const converted = [...leads].filter(([user, at]) => (firstPurchase.get(user) ?? "") > at).length;

  const list = cohorts ?? [];
  const selected = list.find((c) => c.cohort_id === cohortId) ?? list.find((c) => c.students > 0) ?? list[0] ?? null;
  const { data: funnel } = selected ? await supabase.rpc("cohort_lesson_funnel", { p_cohort_id: selected.cohort_id }) : { data: [] };

  return {
    tiles: { sales30, free30, refunds30, leads: leads.size, converted },
    weeklySales: weekly("purchase"),
    weeklyLeads: weekly("free"),
    cohorts: list,
    selected,
    funnel: funnel ?? [],
  };
}
