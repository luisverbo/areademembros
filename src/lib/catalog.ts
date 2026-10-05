import "server-only";
import { cache } from "react";
import type { Profile } from "@/lib/auth";
import type { Tables } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";
import { previewEmbed } from "@/lib/video-embed";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type Course = Pick<
  Tables<"courses">,
  | "id"
  | "slug"
  | "title"
  | "description"
  | "cover_vertical_url"
  | "cover_horizontal_url"
  | "banner_url"
  | "is_free"
  | "showcase_order"
  | "sales_cohort_id"
  | "is_published"
  | "preview_video_provider"
  | "preview_video_id"
  | "preview_start_seconds"
  | "preview_end_seconds"
  | "certificate_enabled"
  | "next_course_id"
  | "module_layout"
>;

/** Como o aluno chega ao curso. */
export type Access = "enrolled" | "free" | "admin" | "locked";

export type LessonItem = {
  id: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  moduleId: string;
  moduleTitle: string;
  isFree: boolean;
  /** Pode assistir agora. */
  isReleased: boolean;
  /** Quando libera (aulas da turma ainda travadas). */
  releaseAt: string | null;
  percent: number;
  completed: boolean;
  lastPositionSeconds: number;
  lastAccessedAt: string | null;
};

export type Cohort = Pick<Tables<"cohorts">, "id" | "name" | "starts_at" | "ends_at"> & { live_url: string | null };

export type ModuleItem = { id: string; title: string; description: string | null; coverUrl: string | null };

export type CourseView = {
  course: Course;
  access: Access;
  cohort: Cohort | null;
  /** Módulos na ordem do curso (só os que têm aula visível para este usuário). */
  modules: ModuleItem[];
  lessons: LessonItem[];
  checkoutUrl: string | null;
  /** Trecho de prévia (trailer) para curso bloqueado: URL do player sem som. */
  previewSrc: string | null;
};

const COURSE_FIELDS =
  "id, slug, title, description, cover_vertical_url, cover_horizontal_url, banner_url, is_free, showcase_order, sales_cohort_id, is_published, preview_video_provider, preview_video_id, preview_start_seconds, preview_end_seconds, certificate_enabled, next_course_id, module_layout";

/** Cursos publicados da vitrine, na ordem definida no admin. */
export const getPublishedCourses = cache(async (): Promise<Course[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("courses")
    .select(COURSE_FIELDS)
    .eq("is_published", true)
    .order("showcase_order")
    .order("created_at");
  return data ?? [];
});

type ActiveEnrollment = { cohort: Cohort & { course_id: string } };

const getActiveEnrollments = cache(async (userId: string): Promise<ActiveEnrollment[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("enrollments")
    .select("status, expires_at, cohort:cohorts(id, name, starts_at, ends_at, course_id, live:cohort_live_links(live_url))")
    .eq("user_id", userId)
    .eq("status", "active");
  const now = Date.now();
  return (data ?? [])
    .filter((e) => e.cohort && (!e.expires_at || new Date(e.expires_at).getTime() > now))
    .map((e) => {
      const { live, ...cohort } = e.cohort!;
      return { cohort: { ...cohort, live_url: live?.live_url ?? null } };
    });
});

/** Link do checkout da turma de venda, com nome e e-mail do aluno já preenchidos. */
async function checkoutUrlFor(supabase: Supabase, course: Course, profile: Profile): Promise<string | null> {
  if (!course.sales_cohort_id) return null;
  const { data } = await supabase.from("cohorts").select("checkout_url").eq("id", course.sales_cohort_id).maybeSingle();
  return withBuyerData(data?.checkout_url ?? null, profile);
}

export function withBuyerData(checkoutUrl: string | null, profile: Pick<Profile, "full_name" | "email" | "whatsapp">): string | null {
  if (!checkoutUrl) return null;
  try {
    const url = new URL(checkoutUrl);
    if (profile.full_name) url.searchParams.set("name", profile.full_name);
    url.searchParams.set("email", profile.email);
    if (profile.whatsapp) url.searchParams.set("phone", profile.whatsapp.replace(/\D/g, ""));
    return url.toString();
  } catch {
    return null;
  }
}

/** Prévia (trailer) do curso bloqueado: vídeo próprio do trailer, sem som, no trecho definido no admin. */
function previewSrcFor(course: Course): string | null {
  if (!course.preview_video_provider || !course.preview_video_id) return null;
  return previewEmbed(
    course.preview_video_provider,
    course.preview_video_id,
    course.preview_start_seconds ?? 0,
    course.preview_end_seconds,
  );
}

/** Monta a visão de um curso para o usuário: acesso, turma, aulas (com liberação) e progresso. */
export async function getCourseView(course: Course, profile: Profile): Promise<CourseView> {
  const supabase = await createClient();
  const enrollments = await getActiveEnrollments(profile.id);
  const enrollment = enrollments.find((e) => e.cohort.course_id === course.id) ?? null;

  const access: Access = enrollment ? "enrolled" : profile.role === "admin" ? "admin" : course.is_free ? "free" : "locked";

  const { data: modules } = await supabase
    .from("modules")
    .select(
      "id, title, description, cover_url, position, lessons(id, title, description, thumbnail_url, duration_seconds, is_free, position)",
    )
    .eq("course_id", course.id)
    .order("position")
    .order("position", { referencedTable: "lessons" });

  const meta = new Map(
    (modules ?? []).flatMap((m) =>
      m.lessons.map((l) => [l.id, { ...l, moduleId: m.id, moduleTitle: m.title, order: m.position * 10_000 + l.position }] as const),
    ),
  );

  // Ordem e liberação: da turma (matriculado) ou do próprio curso.
  let ordered: { id: string; isReleased: boolean; releaseAt: string | null }[];
  if (enrollment) {
    const { data } = await supabase.rpc("cohort_lessons_for_user", { p_cohort_id: enrollment.cohort.id });
    ordered = (data ?? [])
      .filter((r) => meta.has(r.lesson_id))
      .map((r) => ({ id: r.lesson_id, isReleased: r.is_released, releaseAt: r.release_at }));
  } else {
    const { data: unlocks } = await supabase.from("lesson_unlocks").select("lesson_id").eq("user_id", profile.id);
    const unlocked = new Set((unlocks ?? []).map((u) => u.lesson_id));
    ordered = [...meta.values()]
      .sort((a, b) => a.order - b.order)
      .map((l) => ({
        id: l.id,
        isReleased: access === "admin" || access === "free" || l.is_free || unlocked.has(l.id),
        releaseAt: null,
      }));
  }

  const { data: progress } = await supabase
    .from("lesson_progress")
    .select("lesson_id, percent, completed_at, last_position_seconds, last_accessed_at")
    .eq("user_id", profile.id)
    .in(
      "lesson_id",
      ordered.map((o) => o.id),
    );
  const progressById = new Map((progress ?? []).map((p) => [p.lesson_id, p]));

  const lessons: LessonItem[] = ordered.map((o) => {
    const l = meta.get(o.id)!;
    const p = progressById.get(o.id);
    return {
      id: o.id,
      title: l.title,
      description: l.description,
      thumbnailUrl: l.thumbnail_url,
      durationSeconds: l.duration_seconds,
      moduleId: l.moduleId,
      moduleTitle: l.moduleTitle,
      isFree: l.is_free,
      isReleased: o.isReleased,
      releaseAt: o.releaseAt,
      percent: p ? Number(p.percent) : 0,
      completed: Boolean(p?.completed_at),
      lastPositionSeconds: p?.last_position_seconds ?? 0,
      lastAccessedAt: p?.last_accessed_at ?? null,
    };
  });

  const used = new Set(lessons.map((l) => l.moduleId));
  const moduleItems: ModuleItem[] = (modules ?? [])
    .filter((m) => used.has(m.id))
    .sort((a, b) => a.position - b.position)
    .map((m) => ({ id: m.id, title: m.title, description: m.description, coverUrl: m.cover_url }));

  return {
    course,
    access,
    cohort: enrollment ? enrollment.cohort : null,
    modules: moduleItems,
    lessons,
    checkoutUrl: access === "locked" ? await checkoutUrlFor(supabase, course, profile) : null,
    previewSrc: access === "locked" ? previewSrcFor(course) : null,
  };
}

/** Próxima aula a assistir: a primeira liberada e não concluída (ou a primeira liberada). */
export function nextLesson(view: CourseView): LessonItem | null {
  const released = view.lessons.filter((l) => l.isReleased);
  return released.find((l) => !l.completed) ?? released[0] ?? null;
}

/** Próxima aula que ainda vai liberar (para o aviso "Libera seg, 05/10 · 19h"). */
export function upcomingLesson(view: CourseView): LessonItem | null {
  return view.lessons.find((l) => !l.isReleased && l.releaseAt && new Date(l.releaseAt).getTime() > Date.now()) ?? null;
}

export function courseProgress(view: CourseView): { done: number; total: number; percent: number } {
  const total = view.lessons.length;
  const done = view.lessons.filter((l) => l.completed).length;
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
}

/** Cursos que o usuário pode assistir (matriculado ou grátis), para a vitrine. */
export async function getMyCourseViews(profile: Profile): Promise<CourseView[]> {
  const [courses, enrollments] = await Promise.all([getPublishedCourses(), getActiveEnrollments(profile.id)]);
  const enrolledIds = new Set(enrollments.map((e) => e.cohort.course_id));
  const mine = courses.filter((c) => enrolledIds.has(c.id) || c.is_free);
  return Promise.all(mine.map((c) => getCourseView(c, profile)));
}

export async function getCourseBySlug(slug: string): Promise<Course | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("courses").select(COURSE_FIELDS).eq("slug", slug).maybeSingle();
  return data;
}

export async function getCourseByLessonId(lessonId: string): Promise<Course | null> {
  const supabase = await createClient();
  const { data: courseId } = await supabase.rpc("lesson_course_id", { p_lesson_id: lessonId });
  if (!courseId) return null;
  const { data } = await supabase.from("courses").select(COURSE_FIELDS).eq("id", courseId).maybeSingle();
  return data;
}

export type Recommendation = { course: Course; reason: "next" | "peers" | "showcase" };

/**
 * Cursos para oferecer ao aluno, do mais indicado ao menos: o "próximo curso" que o admin
 * definiu nos cursos dele, depois os mais comprados por quem estuda os mesmos cursos.
 */
export async function getRecommendations(limit = 12): Promise<Recommendation[]> {
  const supabase = await createClient();
  const [{ data }, published] = await Promise.all([supabase.rpc("recommended_courses", { p_limit: limit }), getPublishedCourses()]);
  const byId = new Map(published.map((c) => [c.id, c]));
  return (data ?? []).flatMap((r) => {
    const course = byId.get(r.course_id);
    return course ? [{ course, reason: r.reason as Recommendation["reason"] }] : [];
  });
}

/**
 * Visão leve dos cursos que o aluno NÃO tem (vitrine): só o que o card precisa (checkout e prévia),
 * numa consulta para todos os cursos, em vez de quatro por curso. Admin vê a visão completa.
 */
export async function getLockedCourseViews(courses: Course[], profile: Profile): Promise<CourseView[]> {
  if (!courses.length) return [];
  if (profile.role === "admin") return Promise.all(courses.map((c) => getCourseView(c, profile)));

  const supabase = await createClient();
  const cohortIds = courses.flatMap((c) => (c.sales_cohort_id ? [c.sales_cohort_id] : []));
  const { data: cohorts } = cohortIds.length ? await supabase.from("cohorts").select("id, checkout_url").in("id", cohortIds) : { data: [] };
  const checkoutById = new Map((cohorts ?? []).map((c) => [c.id, c.checkout_url]));

  return courses.map((course) => ({
    course,
    access: "locked",
    cohort: null,
    modules: [],
    lessons: [],
    checkoutUrl: course.sales_cohort_id ? withBuyerData(checkoutById.get(course.sales_cohort_id) ?? null, profile) : null,
    previewSrc: previewSrcFor(course),
  }));
}
