import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/field";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";
import { NewStudentForm } from "./new-student-form";

export const metadata: Metadata = { title: "Alunos" };

const PAGE_SIZE = 50;

/** Remove caracteres que quebrariam o filtro do PostgREST ou virariam curinga. */
function sanitizeSearch(value: string) {
  return value
    .replace(/[,()%*_\\:"']/g, " ")
    .trim()
    .slice(0, 100);
}

export default async function StudentsPage({ searchParams }: PageProps<"/admin/alunos">) {
  await requireAdmin();
  const params = await searchParams;
  const q = typeof params.q === "string" ? sanitizeSearch(params.q) : "";
  const cohortFilter = typeof params.turma === "string" ? params.turma : "";
  const page = Math.max(1, Number(params.pagina) || 1);

  const supabase = await createClient();
  const { data: cohorts } = await supabase
    .from("cohorts")
    .select("id, name, course:courses!cohorts_course_id_fkey(title)")
    .order("created_at");
  const cohortOptions = (cohorts ?? []).map((c) => ({ id: c.id, label: `${c.course?.title} · ${c.name}` }));

  let query = supabase
    .from("profiles")
    .select(
      `id, full_name, email, whatsapp, role, created_at, last_seen_at,
       enrollments${cohortFilter ? "!inner" : ""}(id, status, cohort_id)`,
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (q) query = query.or(`email.ilike.*${q}*,full_name.ilike.*${q}*,whatsapp.ilike.*${q}*`);
  if (cohortFilter) query = query.eq("enrollments.cohort_id", cohortFilter);

  const { data: students, count } = await query;
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const pageHref = (p: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (cohortFilter) sp.set("turma", cohortFilter);
    if (p > 1) sp.set("pagina", String(p));
    const s = sp.toString();
    return `/admin/alunos${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <PageHeader title="Alunos" description={`${count ?? 0} pessoa(s) entre alunos, leads e admins.`} />

      <details className="group border-border bg-surface mb-6 rounded-[var(--radius-card)] border">
        <summary className="cursor-pointer list-none px-5 py-3 text-sm font-semibold marker:hidden">
          <span className="text-accent group-open:hidden">+ </span>Adicionar aluno manualmente
        </summary>
        <div className="border-border border-t p-5">
          <NewStudentForm cohorts={cohortOptions} />
        </div>
      </details>

      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <Input name="q" defaultValue={q} placeholder="Buscar por nome, e-mail ou WhatsApp" className="max-w-sm" aria-label="Buscar" />
        <Select name="turma" defaultValue={cohortFilter} className="max-w-xs" aria-label="Filtrar por turma">
          <option value="">Todas as turmas</option>
          {cohortOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </Select>
        <button className={buttonClasses("secondary")}>Filtrar</button>
      </form>

      {!students?.length ? (
        <EmptyState
          title="Ninguém encontrado"
          description={
            q || cohortFilter
              ? "Tente outro filtro."
              : "Os alunos aparecem aqui ao comprar, se cadastrar no grátis ou ao serem adicionados."
          }
        />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-border text-fg-muted border-b text-left text-xs">
                <th className="px-5 py-2.5 font-medium">Nome</th>
                <th className="py-2.5 font-medium">WhatsApp</th>
                <th className="py-2.5 font-medium">Matrículas ativas</th>
                <th className="px-5 py-2.5 text-right font-medium">Último acesso</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id} className="border-border hover:bg-surface-2 border-b last:border-0">
                  <td className="px-5 py-2.5">
                    <Link href={`/admin/alunos/${s.id}`} className="hover:text-accent">
                      <span className="flex items-center gap-2">
                        {s.full_name || s.email}
                        {s.role === "admin" ? <Badge tone="accent">Admin</Badge> : null}
                      </span>
                      {s.full_name ? <span className="text-fg-muted block text-xs">{s.email}</span> : null}
                    </Link>
                  </td>
                  <td className="text-fg-soft py-2.5">{s.whatsapp || "—"}</td>
                  <td className="text-fg-soft py-2.5">{s.enrollments.filter((e) => e.status === "active").length}</td>
                  <td className="text-fg-soft px-5 py-2.5 text-right">
                    {s.last_seen_at ? formatDateTime(s.last_seen_at) : "Nunca entrou"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {totalPages > 1 ? (
        <nav className="mt-4 flex items-center justify-center gap-3 text-sm" aria-label="Paginação">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="text-fg-soft hover:text-fg">
              ← Anterior
            </Link>
          ) : null}
          <span className="text-fg-muted">
            Página {page} de {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={pageHref(page + 1)} className="text-fg-soft hover:text-fg">
              Próxima →
            </Link>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}
