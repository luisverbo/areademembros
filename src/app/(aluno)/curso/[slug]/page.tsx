import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PlayIcon } from "@/components/icons";
import { AdminPreviewBar } from "@/components/student/admin-preview-bar";
import { LessonListItem } from "@/components/student/lesson-list-item";
import { ModuleCard } from "@/components/student/module-card";
import { ProgressBar } from "@/components/student/progress-bar";
import { buttonClasses, LinkButton } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { courseProgress, getCourseBySlug, getCourseView, getRecommendations, nextLesson } from "@/lib/catalog";
import { formatDuration } from "@/lib/forms";

type Props = PageProps<"/curso/[slug]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const course = await getCourseBySlug(slug);
  return { title: course?.title ?? "Curso" };
}

export default async function CoursePage({ params }: Props) {
  const { slug } = await params;
  const [profile, course] = await Promise.all([requireUser(), getCourseBySlug(slug)]);
  if (!course) notFound();

  const view = await getCourseView(course, profile);
  const next = nextLesson(view);
  const progress = courseProgress(view);
  const image = course.banner_url ?? course.cover_horizontal_url;
  const finished = view.access !== "locked" && progress.total > 0 && progress.done === progress.total;
  const nextStep = finished ? (await getRecommendations(1))[0] : undefined;
  const totalSeconds = view.lessons.reduce((sum, l) => sum + (l.durationSeconds ?? 0), 0);
  const useCards = course.module_layout === "cards" && view.modules.length > 0;

  // Lista simples: agrupa por módulo mantendo a ordem da turma.
  const groups: { title: string; items: { lesson: (typeof view.lessons)[number]; index: number }[] }[] = [];
  view.lessons.forEach((lesson, i) => {
    const last = groups.at(-1);
    if (last && last.title === lesson.moduleTitle) last.items.push({ lesson, index: i + 1 });
    else groups.push({ title: lesson.moduleTitle, items: [{ lesson, index: i + 1 }] });
  });

  return (
    <main className="pb-20">
      {profile.role === "admin" ? (
        <AdminPreviewBar editHref={`/admin/cursos/${course.id}`} drafts={course.is_published ? [] : ["o curso"]} />
      ) : null}
      <section className="border-border relative isolate overflow-hidden border-b">
        <div className="absolute inset-0 -z-10">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element -- banner do Storage
            <img src={image} alt="" className="size-full object-cover" />
          ) : (
            <div className="bg-surface size-full" />
          )}
          <div className="bg-bg/70 absolute inset-0" />
        </div>
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 pt-20 pb-10 md:px-10 md:pt-28 md:pb-14">
          <div className="flex flex-wrap items-center gap-2">
            {view.cohort ? (
              <span className="bg-accent w-fit rounded-md px-2 py-1 text-[11px] font-bold tracking-wide text-white uppercase">
                {view.cohort.name}
              </span>
            ) : course.is_free ? (
              <span className="bg-border text-fg-soft w-fit rounded-md px-2 py-1 text-[11px] font-bold tracking-wide uppercase">
                Grátis
              </span>
            ) : null}
            <span className="text-fg-soft text-xs font-semibold tracking-wide uppercase">
              {view.modules.length} módulo{view.modules.length === 1 ? "" : "s"} · {view.lessons.length} aula
              {view.lessons.length === 1 ? "" : "s"}
              {totalSeconds ? ` · ${formatDuration(totalSeconds)}` : ""}
            </span>
          </div>
          <h1 className="max-w-3xl text-4xl leading-[1.05] font-bold md:text-6xl">{course.title}</h1>
          {course.description ? (
            <p className="text-fg-soft max-w-2xl text-base whitespace-pre-line md:text-lg">{course.description}</p>
          ) : null}
          {view.access !== "locked" && progress.total ? (
            <div className="flex max-w-sm flex-col gap-1.5">
              <ProgressBar percent={progress.percent} />
              <span className="text-fg-muted text-xs tabular-nums">
                {progress.done} de {progress.total} aulas concluídas
              </span>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-3 pt-1">
            {view.access === "locked" ? (
              view.checkoutUrl ? (
                <a href={view.checkoutUrl} target="_blank" rel="noopener noreferrer" className={buttonClasses("primary", "lg")}>
                  Desbloquear
                </a>
              ) : (
                <span className="text-fg-muted text-sm">Este curso ainda não está à venda.</span>
              )
            ) : next ? (
              <LinkButton href={`/aula/${next.id}`} size="lg">
                <PlayIcon width={18} height={18} />
                {progress.done > 0 || next.percent > 0 ? "Continuar" : "Começar"}
              </LinkButton>
            ) : null}
            {view.cohort?.live_url ? (
              <a href={view.cohort.live_url} target="_blank" rel="noopener noreferrer" className={buttonClasses("secondary", "lg")}>
                Link da live
              </a>
            ) : null}
          </div>
        </div>
      </section>

      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 pt-10 md:px-10">
        {finished ? (
          <section className="border-accent/50 bg-surface flex flex-col gap-4 rounded-[var(--radius-card)] border p-5 shadow-[0_12px_32px_-16px_rgba(0,0,0,0.8)] md:flex-row md:items-center">
            <div className="flex-1">
              <p className="font-display text-xl font-bold">Você concluiu este curso!</p>
              <p className="text-fg-muted mt-1 text-sm">
                {course.certificate_enabled ? "Seu certificado está pronto." : "Parabéns por chegar até o fim."}
                {nextStep ? ` Próximo passo sugerido: ${nextStep.course.title}.` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {course.certificate_enabled ? (
                <a href={`/curso/${course.slug}/certificado`} className={buttonClasses("primary")}>
                  Baixar certificado
                </a>
              ) : null}
              {nextStep ? (
                <LinkButton href={`/curso/${nextStep.course.slug}`} variant="secondary">
                  Ver {nextStep.course.title}
                </LinkButton>
              ) : null}
            </div>
          </section>
        ) : null}

        {!view.lessons.length ? (
          <p className="text-fg-muted">As aulas deste curso aparecem aqui em breve.</p>
        ) : useCards ? (
          <section className="flex flex-col gap-4">
            <div className="flex items-end justify-between gap-3">
              <h2 className="text-xl font-bold md:text-2xl">Módulos</h2>
              {next ? (
                <Link href={`/aula/${next.id}`} className="text-fg-muted hover:text-fg text-sm">
                  Próxima aula: <span className="text-fg-soft font-semibold">{next.title}</span> →
                </Link>
              ) : null}
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {view.modules.map((m, i) => (
                <ModuleCard
                  key={m.id}
                  module={m}
                  index={i + 1}
                  lessons={view.lessons.filter((l) => l.moduleId === m.id)}
                  href={`/curso/${course.slug}/modulo/${m.id}`}
                />
              ))}
            </div>
          </section>
        ) : (
          groups.map((group, gi) => (
            <section key={`${group.title}-${gi}`} className="flex flex-col gap-2">
              <h2 className="text-fg-muted text-sm font-semibold tracking-wide uppercase">{group.title}</h2>
              <div className="flex flex-col gap-1">
                {group.items.map(({ lesson, index }) => (
                  <LessonListItem key={lesson.id} lesson={lesson} index={index} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </main>
  );
}
