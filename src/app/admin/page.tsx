import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function AdminHome() {
  await requireAdmin();
  const supabase = await createClient();

  const count = async (query: PromiseLike<{ count: number | null }>) => (await query).count ?? 0;
  const [courses, cohorts, students, enrollments] = await Promise.all([
    count(supabase.from("courses").select("*", { count: "exact", head: true })),
    count(supabase.from("cohorts").select("*", { count: "exact", head: true }).eq("is_active", true)),
    count(supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "student")),
    count(supabase.from("enrollments").select("*", { count: "exact", head: true }).eq("status", "active")),
  ]);

  const stats = [
    { label: "Cursos", value: courses, href: "/admin/cursos" },
    { label: "Turmas ativas", value: cohorts, href: "/admin/turmas" },
    { label: "Alunos e leads", value: students, href: "/admin/alunos" },
    { label: "Matrículas ativas", value: enrollments, href: "/admin/alunos" },
  ];

  return (
    <>
      <PageHeader title="Painel" description="Visão geral da área de membros." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="border-border bg-surface hover:border-fg-muted rounded-[var(--radius-card)] border p-4 transition-colors"
          >
            <p className="text-fg-muted text-sm">{s.label}</p>
            <p className="font-display mt-1 text-3xl font-bold">{s.value}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
