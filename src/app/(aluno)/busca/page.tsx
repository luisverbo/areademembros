import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SparkIcon } from "@/components/icons";
import { isAiConfigured } from "@/lib/ai/client";
import { aiQuestionsUsedToday, DAILY_AI_QUESTIONS } from "@/lib/ai/limits";
import { answerFromSegments, findSegments, type SearchHit } from "@/lib/ai/search";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatTimestamp } from "@/lib/transcript";

export const metadata: Metadata = { title: "Pergunte à IA" };

function HitCard({ hit, n }: { hit: SearchHit; n?: number }) {
  return (
    <Link
      href={`/aula/${hit.lessonId}?t=${hit.startSeconds}`}
      className="group border-border bg-surface hover:border-fg-muted flex gap-3 rounded-[var(--radius-card)] border p-4 transition-colors"
    >
      <span className="bg-accent/15 text-accent h-fit shrink-0 rounded-md px-2 py-1 text-sm font-semibold tabular-nums">
        {formatTimestamp(hit.startSeconds)}
      </span>
      <span className="min-w-0">
        <span className="text-fg-muted block text-xs">
          {n ? `[${n}] ` : ""}
          {hit.courseTitle}
        </span>
        <span className="group-hover:text-accent block font-semibold">{hit.lessonTitle}</span>
        <span className="text-fg-muted mt-1 line-clamp-2 block text-sm">{hit.text}</span>
      </span>
    </Link>
  );
}

async function AiAnswer({ query, hits }: { query: string; hits: SearchHit[] }) {
  const result = await answerFromSegments(query, hits).catch(() => null);
  if (!result) return <p className="text-fg-muted text-sm">Não consegui montar a resposta agora. Veja os trechos encontrados abaixo.</p>;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-fg text-base leading-relaxed">{result.answer}</p>
      {result.sources.length ? (
        <div className="flex flex-col gap-2">
          <p className="text-fg-muted text-xs font-semibold tracking-wide uppercase">Onde assistir</p>
          {result.sources.map((hit) => (
            <HitCard key={`${hit.lessonId}-${hit.startSeconds}`} hit={hit} n={hits.indexOf(hit) + 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default async function SearchPage({ searchParams }: PageProps<"/busca">) {
  const profile = await requireUser();
  const raw = (await searchParams).q;
  const query = typeof raw === "string" ? raw.trim().slice(0, 300) : "";

  let hits: SearchHit[] = [];
  let limited = false;
  if (query) {
    hits = await findSegments(query);
    limited = profile.role !== "admin" && (await aiQuestionsUsedToday()) >= DAILY_AI_QUESTIONS;
    if (!limited) {
      const supabase = await createClient();
      await supabase.from("ai_searches").insert({ user_id: profile.id, query });
    }
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold md:text-3xl">
          <SparkIcon width={24} height={24} className="text-accent" /> Pergunte à IA
        </h1>
        <p className="text-fg-muted">Pergunte do seu jeito. A IA procura em todas as suas aulas e mostra a aula e o minuto exato.</p>
      </div>
      <form className="flex gap-2" role="search">
        <input
          name="q"
          defaultValue={query}
          placeholder="Ex.: como conecto o WhatsApp?"
          aria-label="Sua pergunta"
          maxLength={300}
          className="border-border bg-surface-2 placeholder:text-fg-muted focus:border-fg-muted h-12 min-w-0 flex-1 rounded-lg border px-4 text-base focus:outline-none"
        />
        <button className="bg-accent hover:bg-accent-hover h-12 shrink-0 rounded-lg px-5 font-semibold text-white">Perguntar</button>
      </form>

      {query ? (
        <section className="flex flex-col gap-4">
          {isAiConfigured() && !limited ? (
            <div className="border-border bg-surface-2 rounded-[var(--radius-card)] border p-5">
              <Suspense fallback={<p className="text-fg-muted animate-pulse text-sm">Procurando nas suas aulas…</p>}>
                <AiAnswer query={query} hits={hits} />
              </Suspense>
            </div>
          ) : limited ? (
            <p className="text-fg-muted text-sm">Você chegou ao limite de perguntas à IA de hoje. Veja os trechos encontrados:</p>
          ) : null}
          {hits.length ? (
            <details className="group" open={!isAiConfigured() || limited}>
              <summary className="text-fg-soft cursor-pointer text-sm font-semibold">Todos os trechos encontrados ({hits.length})</summary>
              <div className="mt-3 flex flex-col gap-2">
                {hits.map((hit, i) => (
                  <HitCard key={`${hit.lessonId}-${hit.startSeconds}-${i}`} hit={hit} n={i + 1} />
                ))}
              </div>
            </details>
          ) : (
            <p className="text-fg-muted text-sm">Nenhuma aula sua fala sobre isso ainda. Tente com outras palavras.</p>
          )}
        </section>
      ) : null}
    </main>
  );
}
