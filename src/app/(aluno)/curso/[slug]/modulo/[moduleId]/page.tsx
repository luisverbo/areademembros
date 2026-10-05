import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronIcon, PlayIcon } from "@/components/icons";
import { Cover } from "@/components/student/cover";
import { LessonCard } from "@/components/student/lesson-card";
import { moduleStats } from "@/components/student/module-card";
import { ProgressBar } from "@/components/student/progress-bar";
import { LinkButton } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { getCourseBySlug, getCourseView } from "@/lib/catalog";
import { formatReleaseDate } from "@/lib/datetime";
import { formatDuration } from "@/lib/forms";

type Props = PageProps<"/curso/[slug]/modulo/[moduleId]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const course = await getCourseBySlug(slug);
  return { title: course?.title ?? "Módulo" };
}

/** Página do módulo: banner, descrição e as aulas em cards. */
export default async function ModulePage({ params }: Props) {
  const { slug, moduleId } = await params;
  const [profile, course] = await Promise.all([requireUser(), getCourseBySlug(slug)]);
  if (!course) notFound();
  const view = await getCourseView(course, profile);
  const index = view.modules.findIndex((m) => m.id === moduleId);
  if (index < 0) redirect(`/curso/${slug}`);
  const mod = view.modules[index];
  const lessons = view.lessons.filter((l) => l.moduleId === mod.id);
  const offset = view.lessons.findIndex((l) => l.moduleId === mod.id);
  const stats = moduleStats(lessons);
  const totalSeconds = lessons.reduce((sum, l) => sum + (l.durationSeconds ?? 0), 0);
  const prevModule = view.modules[index - 1];
  const nextModule = view.modules[index + 1];

  return (
    <main className="pb-20">
      <section className="border-border relative isolate overflow-hidden border-b">
        <div className="absolute inset-0 -z-10">
          <Cover src={mod.coverUrl ?? course.banner_url ?? course.cover_horizontal_url} className="size-full" />
          <div className="bg-bg/75 absolute inset-0" />
        </div>
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 pt-10 pb-8 md:px-10 md:pt-14 md:pb-10">
          <nav aria-label="Caminho" className="text-fg-muted flex flex-wrap items-center gap-1.5 text-sm">
            <Link href={`/curso/${course.slug}`} className="hover:text-fg">
              {course.title}
            </Link>
            <ChevronIcon width={14} height={14} />
            <span className="text-fg-soft">Módulo {index + 1}</span>
          </nav>
          <h1 className="max-w-3xl text-3xl leading-tight font-bold md:text-5xl">{mod.title}</h1>
          {mod.description ? <p className="text-fg-soft max-w-2xl whitespace-pre-line md:text-lg">{mod.description}</p> : null}
          <p className="text-fg-muted text-sm tabular-nums">
            {lessons.length} aula{lessons.length === 1 ? "" : "s"}
            {totalSeconds ? ` · ${formatDuration(totalSeconds)}` : ""} · {stats.done} concluída{stats.done === 1 ? "" : "s"}
          </p>
          <div className="flex max-w-sm flex-col gap-1.5">
            <ProgressBar percent={stats.percent} />
          </div>
          <div className="flex flex-wrap gap-3 pt-1">
            {stats.next ? (
              <LinkButton href={`/aula/${stats.next.id}`} size="lg">
                <PlayIcon width={18} height={18} />
                {stats.done > 0 || stats.next.percent > 0 ? "Continuar" : "Começar módulo"}
              </LinkButton>
            ) : stats.releaseAt ? (
              <span className="text-fg-soft text-sm">Libera {formatReleaseDate(stats.releaseAt)}</span>
            ) : null}
          </div>
        </div>
      </section>

      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 pt-8 md:px-10">
        <div className="grid gap-x-5 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
          {lessons.map((lesson, i) => (
            <LessonCard key={lesson.id} lesson={lesson} fluid index={offset + i + 1} />
          ))}
        </div>
        <nav aria-label="Outros módulos" className="border-border flex flex-wrap items-center justify-between gap-3 border-t pt-6">
          {prevModule ? (
            <Link
              href={`/curso/${course.slug}/modulo/${prevModule.id}`}
              className="text-fg-muted hover:text-fg inline-flex items-center gap-1 text-sm"
            >
              <ChevronIcon direction="left" /> {prevModule.title}
            </Link>
          ) : (
            <span />
          )}
          {nextModule ? (
            <Link
              href={`/curso/${course.slug}/modulo/${nextModule.id}`}
              className="text-fg-muted hover:text-fg inline-flex items-center gap-1 text-sm"
            >
              {nextModule.title} <ChevronIcon />
            </Link>
          ) : null}
        </nav>
      </div>
    </main>
  );
}
