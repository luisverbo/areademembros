import type { Metadata } from "next";
import Link from "next/link";
import { ColumnChart, PercentBars, StatTile } from "@/components/admin/charts";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { requireAdmin } from "@/lib/auth";
import { getPerformance } from "@/lib/performance";

export const metadata: Metadata = { title: "Desempenho" };

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

export default async function PerformancePage({ searchParams }: PageProps<"/admin/desempenho">) {
  await requireAdmin();
  const turma = (await searchParams).turma;
  const data = await getPerformance(typeof turma === "string" ? turma : null);
  const { tiles, selected, funnel } = data;

  // Maior queda entre uma aula e a seguinte (onde os alunos param).
  let drop: { from: string; to: string; lost: number } | null = null;
  for (let i = 1; i < funnel.length; i++) {
    const lost = pct(funnel[i - 1].completed, funnel[i - 1].students) - pct(funnel[i].completed, funnel[i].students);
    if (lost > 0 && (!drop || lost > drop.lost)) drop = { from: funnel[i - 1].title, to: funnel[i].title, lost };
  }

  return (
    <>
      <PageHeader title="Desempenho" description="Vendas internas, onde os alunos param e como cada turma está indo." />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Vendas (30 dias)" value={String(tiles.sales30)} hint="Matrículas por compra" />
        <StatTile label="Leads grátis (30 dias)" value={String(tiles.free30)} />
        <StatTile
          label="Grátis → compra"
          value={`${pct(tiles.converted, tiles.leads)}%`}
          hint={`${tiles.converted} de ${tiles.leads} leads compraram depois`}
        />
        <StatTile label="Reembolsos (30 dias)" value={String(tiles.refunds30)} />
      </div>

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader title="Por semana" description="Últimas 8 semanas (começando na segunda)." />
          <div className="grid gap-8 md:grid-cols-2">
            <ColumnChart title="Vendas" unit="vendas" points={data.weeklySales} />
            <ColumnChart title="Leads de curso grátis" unit="leads" points={data.weeklyLeads} />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Abandono por aula"
            description={
              selected
                ? `${selected.course_title} · ${selected.cohort_name}: % dos ${selected.students} alunos ativos que concluíram cada aula, na ordem da turma.`
                : "Escolha uma turma."
            }
          />
          {data.cohorts.length > 1 ? (
            <div className="mb-5 flex flex-wrap gap-2">
              {data.cohorts.map((c) => (
                <Link
                  key={c.cohort_id}
                  href={`/admin/desempenho?turma=${c.cohort_id}`}
                  aria-current={c.cohort_id === selected?.cohort_id ? "true" : undefined}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm font-semibold transition-colors",
                    c.cohort_id === selected?.cohort_id
                      ? "border-accent bg-accent/15 text-fg"
                      : "border-border text-fg-muted hover:border-fg-muted hover:text-fg",
                  )}
                >
                  {c.cohort_name}
                </Link>
              ))}
            </div>
          ) : null}
          {funnel.length && selected?.students ? (
            <>
              {drop ? (
                <p className="border-accent/40 bg-accent/10 mb-4 rounded-lg border px-3 py-2 text-sm">
                  Maior queda: de <b>{drop.from}</b> para <b>{drop.to}</b> ({drop.lost} pontos a menos). Vale revisar essa aula.
                </p>
              ) : null}
              <PercentBars
                label="Porcentagem que concluiu cada aula"
                rows={funnel.map((l) => ({
                  key: l.lesson_id,
                  label: l.title,
                  percent: pct(l.completed, l.students),
                  note: `${l.completed} concluíram · ${l.started} começaram · ${l.students} alunos`,
                }))}
              />
            </>
          ) : (
            <EmptyState title="Sem dados ainda" description="Quando houver alunos ativos assistindo, a queda por aula aparece aqui." />
          )}
        </Card>

        <Card>
          <CardHeader title="Comparação entre turmas" description="Só alunos com matrícula ativa." />
          {data.cohorts.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-fg-muted text-left text-xs">
                  <tr>
                    <th className="pb-2 font-medium">Turma</th>
                    <th className="pb-2 font-medium">Alunos</th>
                    <th className="pb-2 font-medium">Aulas</th>
                    <th className="pb-2 font-medium">Progresso médio</th>
                    <th className="pb-2 font-medium">Concluíram</th>
                    <th className="pb-2 font-medium">Parados 7+ dias</th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {data.cohorts.map((c) => (
                    <tr key={c.cohort_id}>
                      <td className="py-2 pr-3">
                        <Link href={`/admin/turmas/${c.cohort_id}`} className="hover:text-accent-soft font-semibold">
                          {c.cohort_name}
                        </Link>{" "}
                        <span className="text-fg-muted">· {c.course_title}</span>{" "}
                        {!c.is_active ? <Badge tone="muted">inativa</Badge> : null}
                      </td>
                      <td className="py-2 pr-3 tabular-nums">{c.students}</td>
                      <td className="py-2 pr-3 tabular-nums">{c.lessons}</td>
                      <td className="py-2 pr-3 tabular-nums">{Number(c.avg_percent).toLocaleString("pt-BR")}%</td>
                      <td className="py-2 pr-3 tabular-nums">
                        {c.completed} <span className="text-fg-muted">({pct(c.completed, c.students)}%)</span>
                      </td>
                      <td className="py-2 tabular-nums">{c.idle}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="Nenhuma turma ainda" />
          )}
        </Card>
      </div>
    </>
  );
}
