import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/datetime";
import { releaseModeLabels } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Turmas" };

export default async function CohortsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: courses } = await supabase
    .from("courses")
    .select(
      "id, title, cohorts!cohorts_course_id_fkey(id, name, release_mode, starts_at, is_active, enrollments(count), cohort_lessons(count))",
    )
    .order("showcase_order")
    .order("created_at", { referencedTable: "cohorts" });

  const withCohorts = (courses ?? []).filter((c) => c.cohorts.length > 0);

  return (
    <>
      <PageHeader
        title="Turmas"
        description="A porta de entrada: quais aulas, quando liberam, por quanto tempo e por qual produto."
        actions={<LinkButton href="/admin/turmas/nova">Nova turma</LinkButton>}
      />
      {!withCohorts.length ? (
        <EmptyState
          title="Nenhuma turma ainda"
          description="Crie uma turma para um curso. Sem turma, os alunos não acessam as aulas pagas."
          action={<LinkButton href="/admin/turmas/nova">Criar turma</LinkButton>}
        />
      ) : (
        <div className="flex flex-col gap-5">
          {withCohorts.map((course) => (
            <Card key={course.id} className="p-0">
              <h2 className="border-border border-b px-5 py-3 font-semibold">{course.title}</h2>
              <ul className="divide-border divide-y">
                {course.cohorts.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/admin/turmas/${c.id}`}
                      className="hover:bg-surface-2 flex flex-wrap items-center justify-between gap-2 px-5 py-3"
                    >
                      <span className="flex items-center gap-2 font-medium">
                        {c.name}
                        {!c.is_active ? <Badge tone="muted">Inativa</Badge> : null}
                      </span>
                      <span className="text-fg-muted text-xs">
                        {releaseModeLabels[c.release_mode]} · {c.cohort_lessons[0]?.count ?? 0} aulas · {c.enrollments[0]?.count ?? 0}{" "}
                        alunos
                        {c.starts_at ? ` · início ${formatDateTime(c.starts_at)}` : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
