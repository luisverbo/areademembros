import type { Metadata } from "next";
import { Hero } from "@/components/student/hero";
import { CourseCard } from "@/components/student/course-card";
import { LessonCard } from "@/components/student/lesson-card";
import { LockedCourseCard } from "@/components/student/locked-course-card";
import { Row } from "@/components/student/row";
import { LinkButton } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import {
  courseProgress,
  getCourseView,
  getMyCourseViews,
  getLockedCourseViews,
  getPublishedCourses,
  getRecommendations,
  type CourseView,
} from "@/lib/catalog";

export const metadata: Metadata = { title: "Início" };

export default async function HomePage() {
  const profile = await requireUser();
  const [mine, all, recommended] = await Promise.all([getMyCourseViews(profile), getPublishedCourses(), getRecommendations(50)]);

  const enrolled = mine.filter((v) => v.access === "enrolled");
  const free = mine.filter((v) => v.access === "free" || (v.access === "admin" && v.course.is_free));
  const lastAccess = (v: CourseView) => Math.max(0, ...v.lessons.map((l) => (l.lastAccessedAt ? new Date(l.lastAccessedAt).getTime() : 0)));

  // Destaque: o curso da turma acessado por último; senão o primeiro grátis; senão o primeiro da vitrine.
  const featured =
    [...enrolled].sort((a, b) => lastAccess(b) - lastAccess(a))[0] ?? free[0] ?? (all[0] ? await getCourseView(all[0], profile) : null);

  const continueWatching = mine
    .flatMap((v) => v.lessons.filter((l) => l.isReleased && l.percent > 0 && !l.completed).map((l) => ({ lesson: l, course: v.course })))
    .sort((a, b) => new Date(b.lesson.lastAccessedAt ?? 0).getTime() - new Date(a.lesson.lastAccessedAt ?? 0).getTime())
    .slice(0, 12);

  const mineIds = new Set(mine.filter((v) => v.access !== "admin").map((v) => v.course.id));
  // Ordem da fileira: recomendação (próximo curso definido no admin, depois "quem fez X também fez Y").
  const rank = new Map(recommended.map((r, i) => [r.course.id, i]));
  const others = all.filter((c) => !mineIds.has(c.id) && !c.is_free).sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999));
  const othersViews = await getLockedCourseViews(others, profile);

  return (
    <main className="flex flex-col gap-10 pb-16">
      {featured ? <Hero view={featured} /> : <EmptyHome />}

      {continueWatching.length ? (
        <Row title="Continuar assistindo">
          {continueWatching.map(({ lesson, course }) => (
            <LessonCard key={lesson.id} lesson={lesson} eyebrow={course.title} />
          ))}
        </Row>
      ) : null}

      {enrolled.map((view) => (
        <Row
          key={view.course.id}
          title={enrolled.length > 1 ? view.course.title : "Sua turma"}
          action={
            <span className="text-fg-muted text-xs tabular-nums">
              {courseProgress(view).done}/{courseProgress(view).total} concluídas
            </span>
          }
        >
          {view.lessons.map((lesson) => (
            <LessonCard key={lesson.id} lesson={lesson} eyebrow={lesson.moduleTitle} />
          ))}
        </Row>
      ))}

      {free.length ? (
        <Row title="Grátis">
          {free.map((view) => (
            <CourseCard
              key={view.course.id}
              title={view.course.title}
              coverUrl={view.course.cover_vertical_url}
              href={`/curso/${view.course.slug}`}
              percent={courseProgress(view).percent}
            />
          ))}
        </Row>
      ) : null}

      {othersViews.length ? (
        <Row title={enrolled.length ? "Mais cursos para você" : "Cursos"}>
          {othersViews.map((view) =>
            view.access === "locked" ? (
              <LockedCourseCard
                key={view.course.id}
                title={view.course.title}
                coverUrl={view.course.cover_vertical_url}
                bannerUrl={view.course.banner_url ?? view.course.cover_horizontal_url}
                description={view.course.description}
                checkoutUrl={view.checkoutUrl}
                detailsHref={`/curso/${view.course.slug}`}
                previewSrc={view.previewSrc}
              />
            ) : (
              <CourseCard
                key={view.course.id}
                title={view.course.title}
                coverUrl={view.course.cover_vertical_url}
                href={`/curso/${view.course.slug}`}
              />
            ),
          )}
        </Row>
      ) : null}
    </main>
  );
}

function EmptyHome() {
  return (
    <div className="border-border mx-4 mt-10 flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-dashed px-6 py-16 text-center md:mx-10">
      <h1 className="text-2xl font-bold">Nenhum curso por aqui ainda</h1>
      <p className="text-fg-muted max-w-md">Quando você entrar numa turma ou num curso grátis, ele aparece nesta página.</p>
      <LinkButton href="/entrar" variant="secondary" className="mt-2">
        Voltar
      </LinkButton>
    </div>
  );
}
