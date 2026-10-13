import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonClasses, LinkButton } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { requireAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { releaseModeLabels } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import { deleteCourse } from "../actions";
import { CourseForm } from "./course-form";
import { ModulesEditor } from "./modules-editor";

export async function generateMetadata({ params }: PageProps<"/admin/cursos/[courseId]">): Promise<Metadata> {
  const { courseId } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("courses").select("title").eq("id", courseId).maybeSingle();
  return { title: data?.title ?? "Curso" };
}

export default async function CoursePage({ params }: PageProps<"/admin/cursos/[courseId]">) {
  await requireAdmin();
  const { courseId } = await params;
  const supabase = await createClient();

  const [{ data: course }, full, { data: cohorts }, { data: otherCourses }] = await Promise.all([
    supabase.from("courses").select("*").eq("id", courseId).maybeSingle(),
    supabase
      .from("modules")
      .select(
        "id, title, description, cover_url, is_addon, addon_checkout_url, position, lessons(id, title, position, is_published, is_free, duration_seconds), module_products(id, provider, external_product_id, label), module_grants(count)",
      )
      .eq("course_id", courseId)
      .eq("module_grants.status", "active")
      .order("position")
      .order("created_at")
      .order("position", { referencedTable: "lessons" })
      .order("created_at", { referencedTable: "lessons" }),
    supabase.from("cohorts").select("id, name, release_mode, is_active, enrollments(count)").eq("course_id", courseId).order("created_at"),
    supabase.from("courses").select("id, title").neq("id", courseId).order("showcase_order"),
  ]);

  // Banco sem as atualizações de módulos (passos 25 e 26): mostra módulos e aulas do jeito básico e avisa.
  let modules = full.data;
  const dbOutdated = Boolean(full.error);
  if (full.error) {
    console.error("modules (banco desatualizado?)", full.error.message);
    const { data: basic } = await supabase
      .from("modules")
      .select("id, title, position, lessons(id, title, position, is_published, is_free, duration_seconds)")
      .eq("course_id", courseId)
      .order("position")
      .order("created_at")
      .order("position", { referencedTable: "lessons" })
      .order("created_at", { referencedTable: "lessons" });
    modules = (basic ?? []).map((m) => ({
      ...m,
      description: null,
      cover_url: null,
      is_addon: false,
      addon_checkout_url: null,
      module_products: [],
      module_grants: [],
    }));
  }
  if (!course) notFound();

  return (
    <>
      <PageHeader
        title={course.title}
        back={{ href: "/admin/cursos", label: "Cursos" }}
        actions={
          <>
            {course.is_published ? <Badge>Publicado</Badge> : <Badge tone="muted">Rascunho</Badge>}
            <a href={`/curso/${course.slug}`} target="_blank" rel="noopener noreferrer" className={buttonClasses("secondary", "sm")}>
              Ver como aluno ↗
            </a>
          </>
        }
      />
      <div className="flex flex-col gap-6">
        <CourseForm siteUrl={env.siteUrl} course={course} cohorts={cohorts ?? []} otherCourses={otherCourses ?? []} />

        {dbOutdated ? (
          <p role="alert" className="border-accent/50 bg-accent/10 rounded-lg border px-4 py-3 text-sm">
            O banco de dados está desatualizado: rode os passos <b>25</b> e <b>26</b> da página de instalação (SQL Editor do Supabase).
            Enquanto isso, dá para criar módulos e aulas normalmente; banner do módulo e order bump aparecem depois.
          </p>
        ) : null}
        <ModulesEditor courseId={course.id} modules={modules ?? []} configurable={!dbOutdated} />

        <Card>
          <CardHeader
            title="Turmas"
            description="Cada turma escolhe quais aulas entram, quando liberam e qual produto dá acesso."
            actions={
              <LinkButton href={`/admin/turmas/nova?curso=${course.id}`} variant="secondary" size="sm">
                + Turma
              </LinkButton>
            }
          />
          {cohorts?.length ? (
            <ul className="divide-border divide-y">
              {cohorts.map((c) => (
                <li key={c.id}>
                  <Link href={`/admin/turmas/${c.id}`} className="hover:text-accent-soft flex items-center justify-between gap-3 py-2.5">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-fg-muted flex items-center gap-2 text-xs">
                      {releaseModeLabels[c.release_mode]} · {c.enrollments[0]?.count ?? 0} alunos
                      {!c.is_active ? <Badge tone="muted">Inativa</Badge> : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-fg-muted text-sm">Nenhuma turma ainda. Sem turma, só o admin vê as aulas (exceto as grátis).</p>
          )}
        </Card>

        <Card className="border-accent/30">
          <CardHeader title="Excluir curso" description="Apaga módulos, aulas, turmas e matrículas deste curso. Não dá para desfazer." />
          <form action={deleteCourse.bind(null, course.id)}>
            <ConfirmSubmit variant="danger" message={`Excluir “${course.title}” com todas as aulas, turmas e matrículas?`}>
              Excluir curso
            </ConfirmSubmit>
          </form>
        </Card>
      </div>
    </>
  );
}
