import "server-only";
import { createClient } from "@/lib/supabase/server";

export type NotebookNote = { id: string; content: string; timestamp_seconds: number | null; updated_at: string };
export type NotebookLesson = { id: string; title: string; moduleTitle: string; order: number; notes: NotebookNote[] };
export type NotebookCourse = { id: string; title: string; lessons: NotebookLesson[] };

/** Todas as anotações do aluno, agrupadas por curso e aula (na ordem do curso). */
export async function getNotebook(userId: string, filter?: { courseId?: string; lessonId?: string }): Promise<NotebookCourse[]> {
  const supabase = await createClient();
  let query = supabase
    .from("notes")
    .select(
      "id, content, timestamp_seconds, updated_at, lesson:lessons!inner(id, title, position, module:modules!inner(title, position, course:courses!inner(id, title)))",
    )
    .eq("user_id", userId)
    .neq("content", "");
  if (filter?.lessonId) query = query.eq("lesson_id", filter.lessonId);
  if (filter?.courseId) query = query.eq("lesson.module.course.id", filter.courseId);
  const { data } = await query;

  const courses = new Map<string, NotebookCourse>();
  for (const row of data ?? []) {
    const lesson = row.lesson;
    const course = lesson?.module?.course;
    if (!lesson || !course) continue;
    let c = courses.get(course.id);
    if (!c) courses.set(course.id, (c = { id: course.id, title: course.title, lessons: [] }));
    let l = c.lessons.find((x) => x.id === lesson.id);
    if (!l) {
      l = {
        id: lesson.id,
        title: lesson.title,
        moduleTitle: lesson.module!.title,
        order: lesson.module!.position * 10_000 + lesson.position,
        notes: [],
      };
      c.lessons.push(l);
    }
    l.notes.push({ id: row.id, content: row.content, timestamp_seconds: row.timestamp_seconds, updated_at: row.updated_at });
  }
  const list = [...courses.values()].sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
  for (const c of list) {
    c.lessons.sort((a, b) => a.order - b.order);
    for (const l of c.lessons) l.notes.sort((a, b) => (a.timestamp_seconds ?? -1) - (b.timestamp_seconds ?? -1));
  }
  return list;
}
