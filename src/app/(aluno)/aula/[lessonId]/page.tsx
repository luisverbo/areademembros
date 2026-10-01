import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronIcon, FileIcon, LockIcon } from "@/components/icons";
import { Countdown } from "@/components/student/countdown";
import { LessonListItem } from "@/components/student/lesson-list-item";
import { VideoPlayer } from "@/components/student/video-player";
import { buttonClasses, LinkButton } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { getCourseByLessonId, getCourseView } from "@/lib/catalog";
import { formatReleaseDate } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";
import { embedFor } from "@/lib/video-embed";
import { CompleteButton } from "./complete-button";
import { Comments, type CommentItem } from "./comments";
import { LessonSidebar } from "./lesson-sidebar";

type Props = PageProps<"/aula/[lessonId]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lessonId } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("lessons").select("title").eq("id", lessonId).maybeSingle();
  return { title: data?.title ?? "Aula" };
}

export default async function LessonPage({ params }: Props) {
  const profile = await requireUser();
  const { lessonId } = await params;
  const course = await getCourseByLessonId(lessonId);
  if (!course) notFound();

  const view = await getCourseView(course, profile);
  const index = view.lessons.findIndex((l) => l.id === lessonId);
  if (index < 0) {
    // Aula fora da turma do aluno (ou não publicada): volta para o curso.
    redirect(`/curso/${course.slug}`);
  }
  const lesson = view.lessons[index];
  const next = view.lessons.slice(index + 1).find((l) => l.isReleased) ?? null;
  const prev = [...view.lessons.slice(0, index)].reverse().find((l) => l.isReleased) ?? null;

  const lessonList = (
    <div className="flex flex-col gap-0.5">
      {view.lessons.map((l, i) => (
        <LessonListItem key={l.id} lesson={l} index={i + 1} current={l.id === lessonId} compact />
      ))}
    </div>
  );

  if (!lesson.isReleased) {
    return (
      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 md:px-10 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="border-border bg-surface flex aspect-video flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border px-6 text-center">
          <LockIcon width={28} height={28} className="text-fg-soft" />
          <h1 className="text-xl font-bold md:text-2xl">{lesson.title}</h1>
          {lesson.releaseAt ? (
            <>
              <p className="text-fg-soft">Libera {formatReleaseDate(lesson.releaseAt)}</p>
              <Countdown to={lesson.releaseAt} className="text-fg-muted text-sm" />
            </>
          ) : view.access === "locked" && view.checkoutUrl ? (
            <a href={view.checkoutUrl} target="_blank" rel="noopener noreferrer" className={buttonClasses("primary", "md", "mt-2")}>
              Desbloquear o curso
            </a>
          ) : (
            <p className="text-fg-muted">Esta aula ainda não está disponível.</p>
          )}
        </div>
        <LessonSidebar lessons={lessonList} />
      </main>
    );
  }

  const supabase = await createClient();
  const [{ data: content }, { data: details }, { data: materials }, { data: comments }] = await Promise.all([
    supabase.from("lesson_contents").select("video_provider, video_id").eq("lesson_id", lessonId).maybeSingle(),
    supabase.from("lessons").select("description").eq("id", lessonId).maybeSingle(),
    supabase.from("lesson_materials").select("id, name").eq("lesson_id", lessonId).order("position"),
    supabase.rpc("lesson_comments", { p_lesson_id: lessonId, p_cohort_id: view.cohort?.id }),
  ]);

  const embed = content ? embedFor(content.video_provider, content.video_id) : null;
  const commentItems: CommentItem[] = (comments ?? []).map((c) => ({
    id: c.id,
    parentId: c.parent_id,
    content: c.content,
    createdAt: c.created_at,
    author: { id: c.author_id, name: c.author_name, isAdmin: c.author_is_admin },
  }));
  const rootCount = commentItems.filter((c) => !c.parentId).length;

  return (
    <main className="mx-auto grid max-w-7xl items-start gap-6 px-4 py-6 md:px-10 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-5 lg:col-start-1">
        {embed ? (
          <VideoPlayer
            key={lessonId}
            provider={embed.provider}
            src={embed.src}
            lessonId={lessonId}
            title={lesson.title}
            startAt={lesson.completed ? 0 : lesson.lastPositionSeconds}
          />
        ) : (
          <div className="border-border bg-surface text-fg-muted flex aspect-video items-center justify-center rounded-[var(--radius-card)] border px-6 text-center">
            O vídeo desta aula ainda não está disponível.
          </div>
        )}

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Link href={`/curso/${course.slug}`} className="text-fg-muted hover:text-fg w-fit text-sm">
              {course.title}
              {view.cohort ? <span className="text-accent"> · {view.cohort.name}</span> : null}
            </Link>
            <h1 className="text-2xl font-bold md:text-3xl">{lesson.title}</h1>
            <p className="text-fg-muted text-sm">
              Aula {index + 1} de {view.lessons.length} · {lesson.moduleTitle}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <CompleteButton key={`${lessonId}-${lesson.completed}`} lessonId={lessonId} completed={lesson.completed} />
            {next ? (
              <LinkButton href={`/aula/${next.id}`} variant="light">
                Próxima aula <ChevronIcon />
              </LinkButton>
            ) : null}
            {prev ? (
              <LinkButton href={`/aula/${prev.id}`} variant="ghost" size="sm">
                <ChevronIcon direction="left" /> Anterior
              </LinkButton>
            ) : null}
            {view.cohort?.live_url ? (
              <a href={view.cohort.live_url} target="_blank" rel="noopener noreferrer" className={buttonClasses("ghost", "sm")}>
                Link da live
              </a>
            ) : null}
          </div>

          {details?.description ? <p className="text-fg-soft max-w-3xl whitespace-pre-line">{details.description}</p> : null}
        </div>
      </div>

      {/* Celular: lista de aulas logo abaixo do vídeo. Desktop: coluna da direita. */}
      <div className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <LessonSidebar lessons={lessonList} />
      </div>

      <div className="flex min-w-0 flex-col gap-5 lg:col-start-1">
        <div className="flex flex-col gap-3">
          {materials?.length ? (
            <details className="group border-border bg-surface rounded-[var(--radius-card)] border">
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold">
                <span className="inline-flex items-center gap-2">
                  <FileIcon className="text-fg-muted" /> Materiais ({materials.length})
                </span>
                <ChevronIcon className="text-fg-muted transition-transform group-open:rotate-90" />
              </summary>
              <ul className="border-border border-t p-2">
                {materials.map((m) => (
                  <li key={m.id}>
                    <a
                      href={`/aula/${lessonId}/material/${m.id}`}
                      className="text-fg-soft hover:bg-surface-2 hover:text-fg flex items-center gap-2 rounded-lg px-2 py-2 text-sm"
                    >
                      <FileIcon className="text-fg-muted shrink-0" />
                      <span className="min-w-0 truncate">{m.name}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          <details className="group border-border bg-surface rounded-[var(--radius-card)] border" open={rootCount > 0}>
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold">
              <span>
                {view.cohort ? "Comentários da turma" : "Comentários"} ({rootCount})
              </span>
              <ChevronIcon className="text-fg-muted transition-transform group-open:rotate-90" />
            </summary>
            <div className="border-border border-t p-4">
              <Comments comments={commentItems} lessonId={lessonId} cohortId={view.cohort?.id ?? null} myId={profile.id} />
            </div>
          </details>
        </div>
      </div>
    </main>
  );
}
