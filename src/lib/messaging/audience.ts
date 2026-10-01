import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Channel } from "./deliver";
import { SEGMENT_LABELS, type Segment } from "./segments";

export const audienceSchema = z.object({
  segment: z.enum(Object.keys(SEGMENT_LABELS) as [Segment, ...Segment[]]),
  courseId: z.uuid().nullable().default(null),
  cohortId: z.uuid().nullable().default(null),
  idleDays: z.coerce.number().int().min(1).max(365).default(7),
});
export type Audience = z.infer<typeof audienceSchema>;

export type Recipient = { userId: string; name: string | null; address: string; courseTitle: string | null };
export type AudienceResult = {
  recipients: Recipient[];
  excluded: { optOut: number; noConsent: number; noAddress: number };
};

type Candidate = { userId: string; courseTitle: string | null };

async function candidates(audience: Audience): Promise<Candidate[]> {
  const admin = createAdminClient();
  const { segment, courseId, cohortId } = audience;

  if (segment === "idle" || segment === "completed") {
    const { data } =
      segment === "idle"
        ? await admin.rpc("automation_idle_students", { p_days: audience.idleDays })
        : await admin.rpc("automation_courses_completed");
    let rows = (data ?? []).filter((r) => !courseId || r.course_id === courseId);
    if (cohortId) {
      const { data: inCohort } = await admin.from("enrollments").select("user_id").eq("cohort_id", cohortId);
      const ids = new Set((inCohort ?? []).map((e) => e.user_id));
      rows = rows.filter((r) => ids.has(r.user_id));
    }
    return rows.map((r) => ({ userId: r.user_id, courseTitle: r.course_title }));
  }

  if (segment === "everyone") {
    const { data } = await admin.from("profiles").select("id").eq("role", "student").limit(50_000);
    return (data ?? []).map((p) => ({ userId: p.id, courseTitle: null }));
  }

  let query = admin
    .from("enrollments")
    .select("user_id, origin, status, expires_at, cohort:cohorts!inner(id, course_id, course:courses!cohorts_course_id_fkey(title))")
    .order("started_at", { ascending: false })
    .limit(50_000);
  if (courseId) query = query.eq("cohort.course_id", courseId);
  if (cohortId) query = query.eq("cohort_id", cohortId);
  if (segment === "free") query = query.eq("origin", "free");
  else query = query.eq("status", "active");
  const { data } = await query;
  let rows = (data ?? []).filter((e) => segment === "free" || !e.expires_at || e.expires_at > new Date().toISOString());

  if (segment === "free") {
    const { data: buyers } = await admin.from("enrollments").select("user_id").eq("origin", "purchase");
    const bought = new Set((buyers ?? []).map((b) => b.user_id));
    rows = rows.filter((e) => !bought.has(e.user_id));
  }
  const seen = new Set<string>();
  return rows
    .filter((e) => !seen.has(e.user_id) && seen.add(e.user_id))
    .map((e) => ({ userId: e.user_id, courseTitle: e.cohort?.course?.title ?? null }));
}

/**
 * Quem recebe: sai quem se descadastrou; em promoção, só quem aceitou mensagens;
 * no WhatsApp, só quem tem número.
 */
export async function resolveAudience(audience: Audience, channel: Channel, purpose: "notice" | "promo"): Promise<AudienceResult> {
  const admin = createAdminClient();
  const list = await candidates(audience);
  const excluded = { optOut: 0, noConsent: 0, noAddress: 0 };
  const recipients: Recipient[] = [];

  for (let i = 0; i < list.length; i += 500) {
    const chunk = list.slice(i, i + 500);
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, full_name, email, whatsapp, role, marketing_consent, messages_opt_out_at")
      .in(
        "id",
        chunk.map((c) => c.userId),
      );
    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
    for (const c of chunk) {
      const p = byId.get(c.userId);
      if (!p || p.role !== "student") continue;
      if (p.messages_opt_out_at) excluded.optOut++;
      else if (purpose === "promo" && !p.marketing_consent) excluded.noConsent++;
      else {
        const address = channel === "email" ? p.email : p.whatsapp;
        if (!address) excluded.noAddress++;
        else recipients.push({ userId: p.id, name: p.full_name, address, courseTitle: c.courseTitle });
      }
    }
  }
  return { recipients, excluded };
}
