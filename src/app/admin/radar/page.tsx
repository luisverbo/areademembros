import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { requireAdmin } from "@/lib/auth";
import { kindPluralLabels, type CommentKind } from "@/lib/radar/classify";
import { getRadar, RADAR_PERIODS, type RadarComment, type RadarPeriod } from "@/lib/radar/data";
import { RadarQueue } from "./queue";

export const metadata: Metadata = { title: "Radar" };

const IDLE_OPTIONS = [7, 15, 30] as const;

function whatsappLink(phone: string | null, name: string) {
  const digits = phone?.replace(/\D/g, "") ?? "";
  if (digits.length < 10) return null;
  const number = digits.length <= 11 ? `55${digits}` : digits;
  const text = `Oi, ${name.split(" ")[0]}! Tudo bem? Senti sua falta nas aulas. Posso te ajudar em alguma coisa?`;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

function CommentList({ items, empty }: { items: RadarComment[]; empty: string }) {
  if (!items.length) return <p className="text-fg-muted text-sm">{empty}</p>;
  return (
    <ul className="divide-border flex flex-col divide-y">
      {items.map((c) => (
        <li key={c.id} className="py-3 first:pt-0 last:pb-0">
          <p className="text-sm whitespace-pre-line">{c.content}</p>
          <p className="text-fg-muted mt-1 text-xs">
            <Link href={`/admin/alunos/${c.authorId}`} className="text-fg-soft hover:text-fg font-semibold">
              {c.authorName}
            </Link>{" "}
            ·{" "}
            <Link href={`/aula/${c.lessonId}`} className="hover:text-fg">
              {c.lessonTitle}
            </Link>
          </p>
        </li>
      ))}
    </ul>
  );
}

export default async function RadarPage({ searchParams }: PageProps<"/admin/radar">) {
  await requireAdmin();
  const params = await searchParams;
  const period = (RADAR_PERIODS as readonly number[]).includes(Number(params.periodo)) ? (Number(params.periodo) as RadarPeriod) : 30;
  const idleDays = (IDLE_OPTIONS as readonly number[]).includes(Number(params.parados)) ? Number(params.parados) : 7;
  const courseId = typeof params.curso === "string" && params.curso ? params.curso : null;
  const radar = await getRadar(period, courseId, idleDays);

  const link = (patch: Record<string, string | number | null>) => {
    const next = new URLSearchParams();
    const merged = { periodo: period, parados: idleDays, curso: courseId, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v !== null && v !== "") next.set(k, String(v));
    return `/admin/radar?${next}`;
  };
  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-sm font-semibold transition-colors",
      active ? "border-accent bg-accent/15 text-fg" : "border-border text-fg-muted hover:border-fg-muted hover:text-fg",
    );

  const urgent = radar.pending.filter((c) => c.urgent).length;
  const kinds: CommentKind[] = ["question", "technical", "complaint", "request", "praise"];

  return (
    <>
      <PageHeader
        title="Radar de Comentários"
        description="O que os alunos estão dizendo, onde travam e quem sumiu. Classificação automática por palavras-chave (sem IA)."
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {RADAR_PERIODS.map((p) => (
          <Link key={p} href={link({ periodo: p })} className={chip(p === period)} aria-current={p === period ? "true" : undefined}>
            {p} dias
          </Link>
        ))}
        <span className="bg-border mx-1 h-5 w-px" />
        <Link href={link({ curso: null })} className={chip(!courseId)}>
          Todos os cursos
        </Link>
        {radar.courses.map((c) => (
          <Link key={c.id} href={link({ curso: c.id })} className={chip(c.id === courseId)}>
            {c.title}
          </Link>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <div className="border-border bg-surface rounded-[var(--radius-card)] border p-4">
          <p className="text-fg-muted text-sm">Comentários</p>
          <p className="font-display mt-1 text-3xl font-bold">{radar.total}</p>
        </div>
        <div
          className={cn("bg-surface rounded-[var(--radius-card)] border p-4", radar.pending.length ? "border-accent/60" : "border-border")}
        >
          <p className="text-fg-muted text-sm">Sem resposta</p>
          <p className="font-display mt-1 text-3xl font-bold">{radar.pending.length}</p>
          {urgent ? (
            <p className="text-accent mt-1 text-xs font-semibold">
              {urgent} urgente{urgent > 1 ? "s" : ""}
            </p>
          ) : null}
        </div>
        {kinds.map((k) => (
          <div key={k} className="border-border bg-surface rounded-[var(--radius-card)] border p-4">
            <p className="text-fg-muted text-sm">{kindPluralLabels[k]}</p>
            <p className="font-display mt-1 text-3xl font-bold">{radar.byKind[k]}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader
            title="Fila de atendimento"
            description="Comentários de alunos ainda sem resposta do professor. Urgentes (reembolso, cancelamento, Procon) e problemas técnicos primeiro."
          />
          {radar.pending.length ? (
            <RadarQueue comments={radar.pending} />
          ) : (
            <EmptyState title="Tudo respondido" description="Nenhum comentário esperando resposta neste período." />
          )}
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="Aulas com mais dúvidas"
              description="Dúvidas e problemas técnicos por aula. Muitas dúvidas no mesmo lugar = aula para revisar."
            />
            {radar.confusingLessons.length ? (
              <ol className="flex flex-col gap-2">
                {radar.confusingLessons.map((l, i) => (
                  <li key={l.lessonId} className="flex items-center gap-3 text-sm">
                    <span className="font-display text-fg-muted w-5 text-right font-bold tabular-nums">{i + 1}</span>
                    <Link href={`/aula/${l.lessonId}`} className="hover:text-accent min-w-0 flex-1 truncate">
                      <span className="font-semibold">{l.lessonTitle}</span> <span className="text-fg-muted">· {l.courseTitle}</span>
                    </Link>
                    <Badge tone="accent">
                      {l.doubts} dúvida{l.doubts > 1 ? "s" : ""}
                    </Badge>
                    <span className="text-fg-muted text-xs tabular-nums">{l.total} no total</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-fg-muted text-sm">Nenhuma dúvida neste período.</p>
            )}
          </Card>

          <Card>
            <CardHeader
              title="O que os alunos procuram"
              description="Buscas mais feitas em “Buscar nas aulas”. Sem resultado = conteúdo que pode faltar."
            />
            {radar.searches.length ? (
              <ul className="flex flex-col gap-2">
                {radar.searches.map((s) => (
                  <li key={s.query} className="flex items-center gap-3 text-sm">
                    <span className="min-w-0 flex-1 truncate font-semibold">{s.query}</span>
                    <span className="text-fg-muted text-xs tabular-nums">{s.count}×</span>
                    {s.found ? (
                      <Badge tone="muted">
                        {s.found} aula{s.found > 1 ? "s" : ""}
                      </Badge>
                    ) : (
                      <Badge tone="accent">sem resultado</Badge>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-fg-muted text-sm">Nenhuma busca neste período.</p>
            )}
          </Card>
        </div>

        <Card>
          <CardHeader title="Palavras mais citadas" description="Nos comentários do período (cada comentário conta uma vez)." />
          {radar.words.length ? (
            <div className="flex flex-wrap gap-2">
              {radar.words.map((w, i) => (
                <span
                  key={w.word}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm",
                    i < 5 ? "border-accent/60 text-fg font-semibold" : "border-border text-fg-soft",
                  )}
                >
                  {w.word} <span className="text-fg-muted tabular-nums">{w.count}</span>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-fg-muted text-sm">Ainda há poucos comentários para mostrar tendências.</p>
          )}
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Pedidos de conteúdo" description="“Poderia fazer uma aula sobre…”, sugestões e ideias dos alunos." />
            <CommentList items={radar.requests} empty="Nenhum pedido neste período." />
          </Card>
          <Card>
            <CardHeader title="Elogios" description="Bons candidatos a depoimento. Peça autorização ao aluno antes de usar." />
            <CommentList items={radar.praises} empty="Nenhum elogio neste período." />
          </Card>
        </div>

        <Card>
          <CardHeader
            title="Alunos parados"
            description="Matrícula ativa e sem entrar na área de membros há mais tempo que o escolhido."
            actions={IDLE_OPTIONS.map((d) => (
              <Link key={d} href={link({ parados: d })} className={chip(d === idleDays)}>
                {d}+ dias
              </Link>
            ))}
          />
          {radar.idle.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-fg-muted text-left text-xs">
                  <tr>
                    <th className="pb-2 font-medium">Aluno</th>
                    <th className="pb-2 font-medium">Curso</th>
                    <th className="pb-2 font-medium">Último acesso</th>
                    <th className="pb-2 font-medium">Aulas concluídas</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {radar.idle.map((s) => {
                    const wa = whatsappLink(s.whatsapp, s.name);
                    return (
                      <tr key={s.userId}>
                        <td className="py-2 pr-3">
                          <Link href={`/admin/alunos/${s.userId}`} className="hover:text-accent font-semibold">
                            {s.name}
                          </Link>
                        </td>
                        <td className="text-fg-soft py-2 pr-3">{s.courseTitle}</td>
                        <td className="text-fg-soft py-2 pr-3">{s.days === null ? "nunca entrou" : `há ${s.days} dias`}</td>
                        <td className="py-2 pr-3 tabular-nums">{s.progress}</td>
                        <td className="py-2 text-right">
                          {wa ? (
                            <a
                              href={wa}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-accent text-xs font-semibold hover:underline"
                            >
                              Chamar no WhatsApp
                            </a>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-fg-muted text-sm">Ninguém parado há {idleDays}+ dias.</p>
          )}
        </Card>
      </div>
    </>
  );
}
