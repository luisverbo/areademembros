import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Cursos" };

export default async function CoursesPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: courses } = await supabase
    .from("courses")
    .select("id, title, slug, is_free, is_published, cover_vertical_url, modules(id, lessons(id)), cohorts!cohorts_course_id_fkey(id)")
    .order("showcase_order")
    .order("created_at");

  return (
    <>
      <PageHeader
        title="Cursos"
        description="A biblioteca de aulas. As turmas definem quem acessa e quando."
        actions={<LinkButton href="/admin/cursos/novo">Novo curso</LinkButton>}
      />
      {!courses?.length ? (
        <EmptyState
          title="Nenhum curso ainda"
          description="Crie o primeiro curso, adicione módulos e aulas, e depois uma turma para liberar o acesso."
          action={<LinkButton href="/admin/cursos/novo">Criar curso</LinkButton>}
        />
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {courses.map((course) => {
            const lessonCount = course.modules.reduce((n, m) => n + m.lessons.length, 0);
            return (
              <li key={course.id}>
                <Link href={`/admin/cursos/${course.id}`} className="group block">
                  <div className="border-border bg-surface-2 relative aspect-[9/16] overflow-hidden rounded-[var(--radius-card)] border">
                    {course.cover_vertical_url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- miniatura no admin
                      <img
                        src={course.cover_vertical_url}
                        alt=""
                        className="size-full object-cover transition-transform group-hover:scale-[1.02]"
                      />
                    ) : (
                      <span className="text-fg-muted flex size-full items-center justify-center p-4 text-center text-sm">Sem capa</span>
                    )}
                    <div className="absolute top-2 left-2 flex gap-1">
                      {!course.is_published ? (
                        <Badge tone="muted" className="bg-bg/80">
                          Rascunho
                        </Badge>
                      ) : null}
                      {course.is_free ? <Badge className="bg-bg/80">Grátis</Badge> : null}
                    </div>
                  </div>
                  <p className="font-display mt-2 line-clamp-2 font-semibold">{course.title}</p>
                  <p className="text-fg-muted text-xs">
                    {lessonCount} {lessonCount === 1 ? "aula" : "aulas"} · {course.cohorts.length}{" "}
                    {course.cohorts.length === 1 ? "turma" : "turmas"}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
