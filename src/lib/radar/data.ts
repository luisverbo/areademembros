import "server-only";
import { createClient } from "@/lib/supabase/server";
import { classifyComment, isUrgent, topWords, type CommentKind } from "./classify";

export const RADAR_PERIODS = [7, 30, 90] as const;
export type RadarPeriod = (typeof RADAR_PERIODS)[number];

export type RadarComment = {
  id: string;
  rootId: string;
  content: string;
  createdAt: string;
  kind: CommentKind | null;
  urgent: boolean;
  authorId: string;
  authorName: string;
  lessonId: string;
  lessonTitle: string;
  courseId: string | null;
  courseTitle: string;
  cohortName: string | null;
};

export type RadarData = {
  total: number;
  pending: RadarComment[];
  byKind: Record<CommentKind, number>;
  confusingLessons: { lessonId: string; lessonTitle: string; courseTitle: string; doubts: number; total: number }[];
  requests: RadarComment[];
  praises: RadarComment[];
  words: { word: string; count: number }[];
  searches: { query: string; count: number; found: number }[];
  idle: { userId: string; name: string; whatsapp: string | null; courseTitle: string; days: number | null; progress: number }[];
  courses: { id: string; title: string }[];
};

const COMMENT_LIMIT = 3000;

type Row = {
  id: string;
  parent_id: string | null;
  content: string;
  created_at: string;
  handled_at: string | null;
  user_id: string;
  lesson_id: string;
  author: { full_name: string | null; email: string; role: string } | null;
  lesson: { title: string; module: { course: { id: string; title: string } | null } | null } | null;
  cohort: { name: string } | null;
};

export async function getRadar(period: RadarPeriod, courseId: string | null, idleDays: number): Promise<RadarData> {
  const supabase = await createClient();
  const since = new Date(Date.now() - period * 86_400_000).toISOString();

  const [{ data: rows }, { data: courses }, { data: searchRows }] = await Promise.all([
    supabase
      .from("comments")
      .select(
        "id, parent_id, content, created_at, handled_at, user_id, lesson_id, author:profiles(full_name, email, role), lesson:lessons(title, module:modules(course:courses(id, title))), cohort:cohorts(name)",
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(COMMENT_LIMIT)
      .overrideTypes<Row[], { merge: false }>(),
    supabase.from("courses").select("id, title").order("showcase_order"),
    supabase.from("ai_searches").select("query").gte("created_at", since).limit(COMMENT_LIMIT),
  ]);

  const all = (rows ?? []).filter((r) => !courseId || r.lesson?.module?.course?.id === courseId);

  // Último recado do professor em cada conversa: o que o aluno escreveu antes disso já foi atendido.
  const lastAdminReply = new Map<string, string>();
  for (const r of all) {
    if (r.author?.role !== "admin") continue;
    const root = r.parent_id ?? r.id;
    if ((lastAdminReply.get(root) ?? "") < r.created_at) lastAdminReply.set(root, r.created_at);
  }

  const students: (RadarComment & { handled: boolean })[] = all
    .filter((r) => r.author?.role !== "admin")
    .map((r) => ({
      id: r.id,
      rootId: r.parent_id ?? r.id,
      content: r.content,
      createdAt: r.created_at,
      kind: classifyComment(r.content),
      urgent: isUrgent(r.content),
      authorId: r.user_id,
      authorName: r.author?.full_name?.trim() || r.author?.email || "Aluno",
      lessonId: r.lesson_id,
      lessonTitle: r.lesson?.title ?? "Aula",
      courseId: r.lesson?.module?.course?.id ?? null,
      courseTitle: r.lesson?.module?.course?.title ?? "",
      cohortName: r.cohort?.name ?? null,
      handled: Boolean(r.handled_at),
    }));

  const priority = (c: RadarComment) =>
    c.urgent ? 0 : c.kind === "technical" ? 1 : c.kind === "complaint" ? 2 : c.kind === "question" ? 3 : 4;
  const pending = students
    .filter((c) => !c.handled && (lastAdminReply.get(c.rootId) ?? "") < c.createdAt)
    .sort((a, b) => priority(a) - priority(b) || b.createdAt.localeCompare(a.createdAt));

  const byKind: Record<CommentKind, number> = { question: 0, complaint: 0, praise: 0, request: 0, technical: 0 };
  const lessons = new Map<string, RadarData["confusingLessons"][number]>();
  for (const c of students) {
    if (c.kind) byKind[c.kind]++;
    const entry = lessons.get(c.lessonId) ?? {
      lessonId: c.lessonId,
      lessonTitle: c.lessonTitle,
      courseTitle: c.courseTitle,
      doubts: 0,
      total: 0,
    };
    entry.total++;
    if (c.kind === "question" || c.kind === "technical") entry.doubts++;
    lessons.set(c.lessonId, entry);
  }
  const confusingLessons = [...lessons.values()]
    .filter((l) => l.doubts > 0)
    .sort((a, b) => b.doubts - a.doubts || b.total - a.total)
    .slice(0, 10);

  // Buscas: as mais repetidas e se existe aula que fala disso (busca sem resultado = conteúdo que falta).
  const queryCounts = new Map<string, { query: string; count: number }>();
  for (const { query } of searchRows ?? []) {
    const key = query.trim().toLowerCase();
    if (!key) continue;
    const entry = queryCounts.get(key) ?? { query: query.trim(), count: 0 };
    entry.count++;
    queryCounts.set(key, entry);
  }
  const topQueries = [...queryCounts.values()].sort((a, b) => b.count - a.count).slice(0, 12);
  const searches = await Promise.all(
    topQueries.map(async (q) => {
      const { data } = await supabase.rpc("search_lesson_segments", { p_query: q.query, p_limit: 60 });
      return { ...q, found: new Set((data ?? []).map((s) => s.lesson_id)).size };
    }),
  );

  return {
    total: students.length,
    pending,
    byKind,
    confusingLessons,
    requests: students.filter((c) => c.kind === "request").slice(0, 20),
    praises: students.filter((c) => c.kind === "praise").slice(0, 20),
    words: topWords(
      students.map((c) => c.content),
      24,
    ),
    searches,
    idle: await getIdleStudents(idleDays, courseId),
    courses: courses ?? [],
  };
}

/** Alunos com matrícula ativa que não entram há N dias (ou nunca entraram). */
async function getIdleStudents(days: number, courseId: string | null): Promise<RadarData["idle"]> {
  const supabase = await createClient();
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  let query = supabase
    .from("enrollments")
    .select(
      "user_id, started_at, cohort:cohorts!inner(course_id, course:courses!cohorts_course_id_fkey(title)), profile:profiles!inner(full_name, email, whatsapp, last_seen_at, role)",
    )
    .eq("status", "active")
    .lte("started_at", cutoff)
    .eq("profile.role", "student")
    .or(`last_seen_at.is.null,last_seen_at.lt.${cutoff}`, { referencedTable: "profile" })
    .order("started_at", { ascending: false })
    .limit(200);
  if (courseId) query = query.eq("cohort.course_id", courseId);
  const { data } = await query;
  const rows = (data ?? []).filter((r) => r.profile && r.cohort);

  const ids = [...new Set(rows.map((r) => r.user_id))];
  const { data: progress } = ids.length
    ? await supabase.from("lesson_progress").select("user_id, completed_at").in("user_id", ids)
    : { data: [] };
  const completed = new Map<string, number>();
  for (const p of progress ?? []) if (p.completed_at) completed.set(p.user_id, (completed.get(p.user_id) ?? 0) + 1);

  const seen = new Set<string>();
  return rows
    .filter((r) => !seen.has(r.user_id) && seen.add(r.user_id))
    .map((r) => {
      const last = r.profile!.last_seen_at;
      return {
        userId: r.user_id,
        name: r.profile!.full_name?.trim() || r.profile!.email,
        whatsapp: r.profile!.whatsapp,
        courseTitle: r.cohort!.course?.title ?? "",
        days: last ? Math.floor((Date.now() - new Date(last).getTime()) / 86_400_000) : null,
        progress: completed.get(r.user_id) ?? 0,
      };
    })
    .sort((a, b) => (b.days ?? Infinity) - (a.days ?? Infinity))
    .slice(0, 50);
}
