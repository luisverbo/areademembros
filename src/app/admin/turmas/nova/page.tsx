import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/page-header";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NewCohortForm } from "./new-cohort-form";

export const metadata: Metadata = { title: "Nova turma" };

export default async function NewCohortPage({ searchParams }: PageProps<"/admin/turmas/nova">) {
  await requireAdmin();
  const { curso } = await searchParams;
  const supabase = await createClient();
  const { data: courses } = await supabase.from("courses").select("id, title").order("showcase_order").order("created_at");

  return (
    <>
      <PageHeader title="Nova turma" back={{ href: "/admin/turmas", label: "Turmas" }} />
      {courses?.length ? (
        <Card>
          <p className="text-fg-muted mb-4 text-sm">
            A turma começa com todas as aulas do curso. Você ajusta quais entram e quando liberam a seguir.
          </p>
          <NewCohortForm courses={courses} defaultCourseId={typeof curso === "string" ? curso : undefined} />
        </Card>
      ) : (
        <EmptyState title="Crie um curso primeiro" action={<LinkButton href="/admin/cursos/novo">Novo curso</LinkButton>} />
      )}
    </>
  );
}
