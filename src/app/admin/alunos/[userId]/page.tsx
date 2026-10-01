import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { requireAdmin } from "@/lib/auth";
import { ProgressBar } from "@/components/student/progress-bar";
import { daysSince, formatDateTime } from "@/lib/datetime";
import { formatDuration } from "@/lib/forms";
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

  // Acompanhamento: progresso por turma, última aula, onde parou e status.
  const [{ data: progressRows }, { data: leads }] = await Promise.all([
    supabase
      .from("lesson_progress")
      .select("lesson_id, percent, completed_at, last_position_seconds, last_accessed_at, lesson:lessons(title)")
      .eq("user_id", userId),
    supabase
      .from("leads")
      .select("id, created_at, utm, course:courses(title)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
  ]);
  const progressById = new Map((progressRows ?? []).map((p) => [p.lesson_id, p]));
  const tracking = await Promise.all(
    (enrollments ?? []).map(async (e) => {
      const { data: cohortLessons } = await supabase.rpc("cohort_lessons_for_user", { p_cohort_id: e.cohort_id, p_user_id: userId });
      const rows = (cohortLessons ?? []).map((cl) => progressById.get(cl.lesson_id)).filter((p): p is NonNullable<typeof p> => Boolean(p));
      const total = cohortLessons?.length ?? 0;
      const done = rows.filter((r) => r.completed_at).length;
      const last = [...rows].sort((a, b) => b.last_accessed_at.localeCompare(a.last_accessed_at))[0] ?? null;
      return { enrollment: e, total, done, percent: total ? Math.round((done / total) * 100) : 0, last };
    }),
  );
  const inactiveDays = daysSince(profile.last_seen_at);
  const statusOf = (t: (typeof tracking)[number]) =>
    t.total > 0 && t.done === t.total ? "Concluiu" : inactiveDays === null || inactiveDays >= 7 ? "Parado" : "Ativo";

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
          <CardHeader
            title="Acompanhamento"
            description={
              profile.last_seen_at
                ? `Último acesso: ${formatDateTime(profile.last_seen_at)}${inactiveDays ? ` (há ${inactiveDays} ${inactiveDays === 1 ? "dia" : "dias"})` : ""}`
                : "Ainda não entrou na área."
            }
          />
          {tracking.length ? (
            <ul className="flex flex-col gap-4">
              {tracking.map((t) => (
                <li key={t.enrollment.id} className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">
                      {t.enrollment.cohort?.course?.title} · {t.enrollment.cohort?.name}
                    </span>
                    <Badge tone={statusOf(t) === "Parado" ? "accent" : "neutral"}>{statusOf(t)}</Badge>
                  </div>
                  <ProgressBar percent={t.percent} className="max-w-md" />
                  <p className="text-fg-muted text-xs">
                    {t.done} de {t.total} aulas concluídas ({t.percent}%)
                    {t.last
                      ? ` · última aula: ${t.last.lesson?.title ?? "—"}${t.last.completed_at ? " (concluída)" : `, parou em ${formatDuration(t.last.last_position_seconds)}`} em ${formatDateTime(t.last.last_accessed_at)}`
                      : " · ainda não assistiu"}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-fg-muted text-sm">Sem matrículas.</p>
          )}
          {leads?.length ? (
            <div className="border-border mt-5 border-t pt-4">
              <h3 className="text-fg-soft mb-2 text-sm font-semibold">Cadastros em cursos grátis</h3>
              <ul className="text-fg-muted flex flex-col gap-1 text-xs">
                {leads.map((l) => {
                  const utm = l.utm as Record<string, string>;
                  return (
                    <li key={l.id}>
                      {l.course?.title ?? "Curso removido"} · {formatDateTime(l.created_at)}
                      {utm.utm_source ? ` · origem: ${utm.utm_source}${utm.utm_campaign ? ` / ${utm.utm_campaign}` : ""}` : ""}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
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
