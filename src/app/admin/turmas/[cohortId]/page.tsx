import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/datetime";
import { enrollmentOriginLabels, enrollmentStatusLabels, providerLabels } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import { deleteCohort, duplicateCohort, removeCohortProduct } from "../actions";
import { CohortForm } from "./cohort-form";
import { EnrollForm } from "./enroll-form";
import { LessonsSchedule } from "./lessons-schedule";
import { ProductsForm } from "./products-form";

type Props = PageProps<"/admin/turmas/[cohortId]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { cohortId } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("cohorts").select("name").eq("id", cohortId).maybeSingle();
  return { title: data?.name ?? "Turma" };
}

export default async function CohortPage({ params }: Props) {
  const admin = await requireAdmin();
  const { cohortId } = await params;
  const supabase = await createClient();

  const { data: cohort } = await supabase
    .from("cohorts")
    .select("*, course:courses!cohorts_course_id_fkey(id, title)")
    .eq("id", cohortId)
    .maybeSingle();
  if (!cohort || !cohort.course) notFound();

  const [{ data: modules }, { data: cohortLessons }, { data: preview }, { data: products }, { data: enrollments }, { data: live }] =
    await Promise.all([
      supabase
        .from("modules")
        .select("title, lessons(id, title, is_published, position)")
        .eq("course_id", cohort.course_id)
        .order("position")
        .order("position", { referencedTable: "lessons" }),
      supabase.from("cohort_lessons").select("lesson_id, position, release_at, release_offset_days").eq("cohort_id", cohortId),
      supabase.rpc("cohort_lessons_for_user", { p_cohort_id: cohortId, p_user_id: admin.id }),
      supabase.from("cohort_products").select("*").eq("cohort_id", cohortId).order("created_at"),
      supabase
        .from("enrollments")
        .select("id, status, origin, provider, started_at, expires_at, user:profiles!enrollments_user_id_fkey(id, full_name, email)")
        .eq("cohort_id", cohortId)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase.from("cohort_live_links").select("live_url").eq("cohort_id", cohortId).maybeSingle(),
    ]);

  const courseLessons = (modules ?? []).flatMap((m) =>
    m.lessons.map((l) => ({ id: l.id, title: l.title, moduleTitle: m.title, isPublished: l.is_published })),
  );
  const previewMap = Object.fromEntries((preview ?? []).map((p) => [p.lesson_id, p.release_at]));
  const intervalDays = Number((cohort.release_config as { interval_days?: number })?.interval_days ?? 7);

  return (
    <>
      <PageHeader
        title={cohort.name}
        description={
          <>
            Curso:{" "}
            <Link href={`/admin/cursos/${cohort.course.id}`} className="text-fg-soft hover:text-accent-soft">
              {cohort.course.title}
            </Link>
          </>
        }
        back={{ href: "/admin/turmas", label: "Turmas" }}
        actions={
          <>
            {!cohort.is_active ? <Badge tone="muted">Inativa</Badge> : null}
            <form action={duplicateCohort.bind(null, cohort.id)}>
              <Button type="submit" variant="secondary" size="sm">
                Duplicar turma
              </Button>
            </form>
          </>
        }
      />
      <div className="flex flex-col gap-6">
        <CohortForm cohort={cohort} liveUrl={live?.live_url ?? null} />

        <LessonsSchedule
          key={`${cohort.release_mode}-${cohort.updated_at}`}
          cohortId={cohort.id}
          mode={cohort.release_mode}
          intervalDays={intervalDays}
          courseLessons={courseLessons}
          cohortLessons={cohortLessons ?? []}
          preview={previewMap}
        />

        <Card>
          <CardHeader
            title="Produtos do checkout"
            description="A compra de qualquer produto ligado aqui matricula o aluno nesta turma. Um produto só libera uma turma."
          />
          {products?.length ? (
            <ul className="divide-border border-border mb-5 divide-y rounded-lg border">
              {products.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{providerLabels[p.provider]}</span>
                    <span className="text-fg-muted mx-2">·</span>
                    <code className="text-fg-soft">{p.external_product_id}</code>
                    {p.label ? <span className="text-fg-muted ml-2">({p.label})</span> : null}
                  </span>
                  <form action={removeCohortProduct.bind(null, p.id, cohort.id)}>
                    <ConfirmSubmit
                      variant="ghost"
                      size="sm"
                      message="Desligar este produto? Novas compras dele deixarão de liberar a turma."
                    >
                      Remover
                    </ConfirmSubmit>
                  </form>
                </li>
              ))}
            </ul>
          ) : null}
          <ProductsForm cohortId={cohort.id} />
        </Card>

        <Card>
          <CardHeader
            title={`Alunos (${enrollments?.length ?? 0})`}
            description="Matrícula manual: o aluno entra pelo link mágico em /entrar."
          />
          <EnrollForm cohortId={cohort.id} />
          {enrollments?.length ? (
            <div className="-mx-5 mt-5 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-border text-fg-muted border-y text-left text-xs">
                    <th className="px-5 py-2 font-medium">Aluno</th>
                    <th className="py-2 font-medium">Origem</th>
                    <th className="py-2 font-medium">Entrada</th>
                    <th className="py-2 font-medium">Expira</th>
                    <th className="px-5 py-2 text-right font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {enrollments.map((e) => (
                    <tr key={e.id} className="border-border border-b">
                      <td className="px-5 py-2">
                        {e.user ? (
                          <Link href={`/admin/alunos/${e.user.id}`} className="hover:text-accent-soft">
                            <span className="block">{e.user.full_name || e.user.email}</span>
                            {e.user.full_name ? <span className="text-fg-muted block text-xs">{e.user.email}</span> : null}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="text-fg-soft py-2">
                        {enrollmentOriginLabels[e.origin]}
                        {e.provider ? ` · ${providerLabels[e.provider]}` : ""}
                      </td>
                      <td className="text-fg-soft py-2">{formatDateTime(e.started_at)}</td>
                      <td className="text-fg-soft py-2">{e.expires_at ? formatDateTime(e.expires_at) : "Vitalício"}</td>
                      <td className="px-5 py-2 text-right">
                        <Badge tone={e.status === "active" ? "neutral" : "accent"}>{enrollmentStatusLabels[e.status]}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </Card>

        <Card className="border-accent/30">
          <CardHeader title="Excluir turma" description="Os alunos desta turma perdem o acesso na hora. Não dá para desfazer." />
          <form action={deleteCohort.bind(null, cohort.id, cohort.course_id)}>
            <ConfirmSubmit variant="danger" message={`Excluir “${cohort.name}”? ${enrollments?.length ?? 0} aluno(s) perdem o acesso.`}>
              Excluir turma
            </ConfirmSubmit>
          </form>
        </Card>
      </div>
    </>
  );
}
