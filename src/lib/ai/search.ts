import "server-only";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import { createClient } from "@/lib/supabase/server";
import { formatTimestamp } from "@/lib/transcript";
import { AI_BETAS, AI_MODEL, aiClient } from "./client";

export type SearchHit = { lessonId: string; lessonTitle: string; courseTitle: string; startSeconds: number; text: string };

/** Trechos das aulas liberadas para o aluno. Primeiro todas as palavras; se não achar, qualquer uma. */
export async function findSegments(query: string): Promise<SearchHit[]> {
  const supabase = await createClient();
  const run = async (q: string) => {
    const { data } = await supabase.rpc("search_lesson_segments", { p_query: q, p_limit: 12 });
    return (data ?? []).map((r) => ({
      lessonId: r.lesson_id,
      lessonTitle: r.lesson_title,
      courseTitle: r.course_title,
      startSeconds: r.start_seconds,
      text: r.text,
    }));
  };
  const strict = await run(query);
  if (strict.length) return strict;
  const words = query.split(/\s+/).filter((w) => w.length > 2);
  return words.length > 1 ? run(words.join(" or ")) : [];
}

const AnswerSchema = z.object({
  answer: z.string().describe("Resposta curta em português, citando as fontes pelo número entre colchetes, ex.: [1]"),
  sources: z.array(z.number().int()).describe("Números das fontes que respondem, da mais útil para a menos útil"),
});

const SYSTEM = `Você é a busca inteligente de uma área de membros de cursos para donos de pequenos negócios.
Recebe a pergunta do aluno e trechos numerados das aulas que ele pode assistir.
Responda em português do Brasil, em 2 a 4 frases, dizendo em qual aula e em que minuto está a resposta, citando as fontes como [1], [2].
Use só os trechos. Se nenhum trecho responder, diga que não encontrou nas aulas e sugira como perguntar de outro jeito; nesse caso, sources fica vazio.`;

export async function answerFromSegments(query: string, hits: SearchHit[]): Promise<{ answer: string; sources: SearchHit[] } | null> {
  const context = hits
    .map((h, i) => `[${i + 1}] ${h.courseTitle} › ${h.lessonTitle} [${formatTimestamp(h.startSeconds)}]: ${h.text}`)
    .join("\n");
  const response = await aiClient().beta.messages.parse({
    model: AI_MODEL,
    max_tokens: 4000,
    betas: AI_BETAS,
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(AnswerSchema) },
    system: SYSTEM,
    messages: [{ role: "user", content: `Pergunta: ${query}\n\nTrechos:\n${context || "(nenhum trecho encontrado)"}` }],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) return null;
  const sources = response.parsed_output.sources
    .filter((n) => n >= 1 && n <= hits.length)
    .map((n) => hits[n - 1])
    .filter((h, i, arr) => arr.findIndex((x) => x.lessonId === h.lessonId && x.startSeconds === h.startSeconds) === i);
  return { answer: response.parsed_output.answer, sources };
}
