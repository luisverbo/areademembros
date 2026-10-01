import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { isAiConfigured } from "@/lib/ai/client";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { deleteLesson } from "./actions";
import { LessonForm } from "./lesson-form";
import { Materials } from "./materials";
import { TranscriptEditor } from "./transcript-editor";

type Props = PageProps<"/admin/cursos/[courseId]/aulas/[lessonId]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lessonId } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("lessons").select("title").eq("id", lessonId).maybeSingle();
  return { title: data?.title ?? "Aula" };
}

export default async function LessonPage({ params }: Props) {
  await requireAdmin();
  const { courseId, lessonId } = await params;
  const supabase = await createClient();

  const [{ data: lesson }, { data: content }, { data: materials }, { data: modules }, { data: course }] = await Promise.all([
    supabase.from("lessons").select("*").eq("id", lessonId).maybeSingle(),
    supabase
      .from("lesson_contents")
      .select("video_provider, video_id, transcript, ai_status, ai_error, ai_summary, ai_checklist")
      .eq("lesson_id", lessonId)
      .maybeSingle(),
    supabase.from("lesson_materials").select("id, name, file_type, size_bytes").eq("lesson_id", lessonId).order("position"),
    supabase.from("modules").select("id, title").eq("course_id", courseId).order("position"),
    supabase.from("courses").select("title").eq("id", courseId).maybeSingle(),
  ]);
  if (!lesson || !course || !modules?.some((m) => m.id === lesson.module_id)) notFound();
  const { count: segmentCount } = await supabase
    .from("lesson_transcript_segments")
    .select("id", { count: "exact", head: true })
    .eq("lesson_id", lessonId);

  return (
    <>
      <PageHeader
        title={lesson.title}
        back={{ href: `/admin/cursos/${courseId}`, label: course.title }}
        actions={
          <a href={`/aula/${lesson.id}`} target="_blank" rel="noopener noreferrer" className={buttonClasses("secondary", "sm")}>
            Ver como aluno ↗
          </a>
        }
      />
      <div className="flex flex-col gap-6">
        <LessonForm courseId={courseId} lesson={lesson} content={content} modules={modules} />
        <Materials lessonId={lesson.id} courseId={courseId} materials={materials ?? []} />
        <TranscriptEditor
          lessonId={lesson.id}
          courseId={courseId}
          transcript={content?.transcript ?? null}
          segmentCount={segmentCount ?? 0}
          aiConfigured={isAiConfigured()}
          status={(content?.ai_status as "idle" | "processing" | "ready" | "error") ?? "idle"}
          error={content?.ai_error ?? null}
          summary={(content?.ai_summary as never) ?? null}
          checklist={(content?.ai_checklist as string[] | null) ?? null}
        />
        <Card className="border-accent/30">
          <CardHeader title="Excluir aula" description="Remove a aula de todas as turmas, com progresso, comentários e materiais." />
          <form action={deleteLesson.bind(null, lesson.id, courseId)}>
            <ConfirmSubmit variant="danger" message={`Excluir a aula “${lesson.title}”?`}>
              Excluir aula
            </ConfirmSubmit>
          </form>
        </Card>
      </div>
    </>
  );
}
