import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/datetime";
import { enrollmentOriginLabels, enrollmentStatusLabels, providerLabels } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import { deleteEnrollment, removeUnlock } from "../actions";
import { EnrollmentForm, EnrollStudentForm, ProfileForm, UnlockForm } from "./forms";

type Props = PageProps<"/admin/alunos/[userId]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { userId } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("full_name, email").eq("id", userId).maybeSingle();
  return { title: data?.full_name || data?.email || "Aluno" };
}

export default async function StudentPage({ params }: Props) {
  await requireAdmin();
  const { userId } = await params;
  const supabase = await createClient();

  const [{ data: profile }, { data: enrollments }, { data: unlocks }, { data: cohorts }, { data: courses }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase
      .from("enrollments")
      .select("*, cohort:cohorts(id, name, course_id, course:courses!cohorts_course_id_fkey(title))")
      .eq("user_id", userId)
      .order("created_at"),
    supabase.from("lesson_unlocks").select("lesson_id, created_at, lesson:lessons(title)").eq("user_id", userId),
    supabase.from("cohorts").select("id, name, course_id, course:courses!cohorts_course_id_fkey(title)").order("created_at"),
    supabase
      .from("courses")
      .select("title, modules(title, position, lessons(id, title, position))")
      .order("showcase_order")
      .order("position", { referencedTable: "modules" })
      .order("position", { referencedTable: "modules.lessons" }),
  ]);
  if (!profile) notFound();

  const allCohorts = (cohorts ?? []).map((c) => ({ id: c.id, courseId: c.course_id, label: `${c.course?.title} · ${c.name}` }));
  const enrolledCohortIds = new Set((enrollments ?? []).map((e) => e.cohort_id));
  // Regra: uma matrícula ativa por curso. Para trocar de turma, edita-se a matrícula existente.
  const activeCourseIds = new Set((enrollments ?? []).filter((e) => e.status === "active").map((e) => e.cohort?.course_id));
  const lessonOptions = (courses ?? []).flatMap((c) =>
    c.modules.flatMap((m) => m.lessons.map((l) => ({ id: l.id, label: `${c.title} · ${m.title} · ${l.title}` }))),
  );

  return (
    <>
      <PageHeader
        title={profile.full_name || profile.email}
        description={
          <>
            {profile.email} · cadastro em {formatDateTime(profile.created_at)}
            {profile.marketing_consent ? " · aceita mensagens" : " · não aceitou mensagens"}
          </>
        }
        back={{ href: "/admin/alunos", label: "Alunos" }}
        actions={profile.role === "admin" ? <Badge tone="accent">Admin</Badge> : null}
      />
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader title="Dados" />
          <ProfileForm userId={profile.id} fullName={profile.full_name} whatsapp={profile.whatsapp} role={profile.role} />
        </Card>

        <Card>
          <CardHeader title="Matrículas" description="Acesso por turma. Reembolso e expiração tiram o acesso na hora." />
          <div className="flex flex-col gap-4">
            {(enrollments ?? []).map((e) => (
              <div key={e.id} className="border-border bg-surface-2 rounded-lg border p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <Link href={`/admin/turmas/${e.cohort_id}`} className="hover:text-accent font-semibold">
                      {e.cohort?.course?.title} · {e.cohort?.name}
                    </Link>
                    <p className="text-fg-muted text-xs">
                      {enrollmentOriginLabels[e.origin]}
                      {e.provider ? ` · ${providerLabels[e.provider]}` : ""}
                      {e.external_transaction_id ? ` · transação ${e.external_transaction_id}` : ""} · entrada em{" "}
                      {formatDateTime(e.started_at)}
                    </p>
                  </div>
                  <Badge tone={e.status === "active" ? "neutral" : "accent"}>{enrollmentStatusLabels[e.status]}</Badge>
                </div>
                <EnrollmentForm
                  userId={profile.id}
                  enrollment={e}
                  cohorts={allCohorts.filter(
                    (c) => c.courseId === e.cohort?.course_id && (c.id === e.cohort_id || !enrolledCohortIds.has(c.id)),
                  )}
                />
                <form action={deleteEnrollment.bind(null, e.id, profile.id)} className="mt-2">
                  <ConfirmSubmit variant="ghost" size="sm" message="Excluir esta matrícula? O aluno perde o acesso a esta turma.">
                    Excluir matrícula
                  </ConfirmSubmit>
                </form>
              </div>
            ))}
            <EnrollStudentForm
              userId={profile.id}
              cohorts={allCohorts.filter((c) => !enrolledCohortIds.has(c.id) && !activeCourseIds.has(c.courseId))}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Aulas liberadas individualmente" description="Libera uma aula para este aluno, fora do calendário da turma." />
          {unlocks?.length ? (
            <ul className="divide-border border-border mb-4 divide-y rounded-lg border">
              {unlocks.map((u) => (
                <li key={u.lesson_id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate">{u.lesson?.title}</span>
                  <form action={removeUnlock.bind(null, profile.id, u.lesson_id)}>
                    <ConfirmSubmit variant="ghost" size="sm" message="Remover a liberação desta aula?">
                      Remover
                    </ConfirmSubmit>
                  </form>
                </li>
              ))}
            </ul>
          ) : null}
          <UnlockForm userId={profile.id} lessons={lessonOptions} />
        </Card>
      </div>
    </>
  );
}
