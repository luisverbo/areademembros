import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlayIcon } from "@/components/icons";
import { AdminPreviewBar } from "@/components/student/admin-preview-bar";
import { LessonListItem } from "@/components/student/lesson-list-item";
import { ProgressBar } from "@/components/student/progress-bar";
import { buttonClasses, LinkButton } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { courseProgress, getCourseBySlug, getCourseView, nextLesson } from "@/lib/catalog";

type Props = PageProps<"/curso/[slug]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const course = await getCourseBySlug(slug);
  return { title: course?.title ?? "Curso" };
}

export default async function CoursePage({ params }: Props) {
  const profile = await requireUser();
  const { slug } = await params;
  const course = await getCourseBySlug(slug);
  if (!course) notFound();

  const view = await getCourseView(course, profile);
  const next = nextLesson(view);
  const progress = courseProgress(view);
  const image = course.banner_url ?? course.cover_horizontal_url;

  // Agrupa por módulo mantendo a ordem da turma.
  const groups: { title: string; items: { lesson: (typeof view.lessons)[number]; index: number }[] }[] = [];
  view.lessons.forEach((lesson, i) => {
    const last = groups.at(-1);
    if (last && last.title === lesson.moduleTitle) last.items.push({ lesson, index: i + 1 });
    else groups.push({ title: lesson.moduleTitle, items: [{ lesson, index: i + 1 }] });
  });

  return (
    <main className="pb-16">
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
          <div className="bg-bg/75 absolute inset-0" />
        </div>
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 pt-16 pb-8 md:px-10 md:pt-24">
          {view.cohort ? (
            <span className="bg-accent w-fit rounded-md px-2 py-1 text-[11px] font-bold tracking-wide text-white uppercase">
              {view.cohort.name}
            </span>
          ) : course.is_free ? (
            <span className="bg-border text-fg-soft w-fit rounded-md px-2 py-1 text-[11px] font-bold tracking-wide uppercase">Grátis</span>
          ) : null}
          <h1 className="text-3xl font-bold md:text-4xl">{course.title}</h1>
          {course.description ? <p className="text-fg-soft max-w-2xl whitespace-pre-line">{course.description}</p> : null}
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

      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 pt-8 md:px-10">
        {groups.length ? (
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
        ) : (
          <p className="text-fg-muted">As aulas deste curso aparecem aqui em breve.</p>
        )}
      </div>
    </main>
  );
}
