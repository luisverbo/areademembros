import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import { createAdminClient } from "@/lib/supabase/admin";
import { transcriptForPrompt } from "@/lib/transcript";
import { AI_BETAS, AI_MODEL, aiClient, isAiConfigured } from "./client";

export const SummarySchema = z.object({
  points: z.array(
    z.object({
      title: z.string().describe("Ideia principal em poucas palavras"),
      detail: z.string().describe("Uma ou duas frases explicando"),
      start_seconds: z
        .number()
        .int()
        .nullable()
        .describe("Segundo da aula em que o assunto começa; null se a transcrição não tiver minutos"),
    }),
  ),
  checklist: z.array(z.string().describe("Ação prática que o aluno deve fazer depois da aula")),
});
export type LessonSummary = z.infer<typeof SummarySchema>;

const SYSTEM = `Você resume aulas de cursos online para alunos brasileiros de pequenos negócios.
Escreva em português do Brasil, de forma direta e prática, sem jargão desnecessário.
Gere de 3 a 5 pontos principais, na ordem em que aparecem na aula, cada um com o segundo em que o assunto começa (use os minutos entre colchetes da transcrição).
Gere de 3 a 8 itens de checklist: ações concretas que o aluno consegue fazer depois de assistir.
Use só o que está na transcrição; não invente ferramentas, números ou passos que a aula não mostra.`;

/** Gera (ou refaz) o resumo e o checklist da aula a partir da transcrição salva. Nunca lança erro. */
export async function generateLessonSummary(lessonId: string): Promise<void> {
  const admin = createAdminClient();
  const setStatus = (fields: {
    ai_status: "processing" | "ready" | "error" | "idle";
    ai_error?: string | null;
    ai_summary?: unknown;
    ai_checklist?: unknown;
  }) =>
    admin
      .from("lesson_contents")
      .update({ ...fields, ai_updated_at: new Date().toISOString() } as never)
      .eq("lesson_id", lessonId);

  if (!isAiConfigured()) {
    await setStatus({ ai_status: "error", ai_error: "IA não configurada (falta ANTHROPIC_API_KEY)." });
    return;
  }

  const [{ data: lesson }, { data: segments }] = await Promise.all([
    admin.from("lessons").select("title, description").eq("id", lessonId).single(),
    admin.from("lesson_transcript_segments").select("start_seconds, text").eq("lesson_id", lessonId).order("start_seconds"),
  ]);
  if (!lesson || !segments?.length) {
    await setStatus({ ai_status: "idle", ai_error: null });
    return;
  }

  await setStatus({ ai_status: "processing", ai_error: null });
  const hasTimestamps = segments.some((s) => s.start_seconds > 0);

  try {
    const response = await aiClient().beta.messages.parse({
      model: AI_MODEL,
      max_tokens: 16000,
      betas: AI_BETAS,
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(SummarySchema) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Aula: ${lesson.title}\n${lesson.description ? `Descrição: ${lesson.description}\n` : ""}\nTranscrição${hasTimestamps ? " (com minutos)" : " (sem minutos)"}:\n${transcriptForPrompt(segments, hasTimestamps)}`,
        },
      ],
    });

    if (response.stop_reason === "refusal" || !response.parsed_output) {
      await setStatus({ ai_status: "error", ai_error: "A IA não conseguiu resumir esta aula. Tente gerar de novo." });
      return;
    }
    const out = response.parsed_output;
    const points = out.points.slice(0, 5).map((p) => ({ ...p, start_seconds: hasTimestamps ? p.start_seconds : null }));
    await setStatus({ ai_status: "ready", ai_error: null, ai_summary: { points }, ai_checklist: out.checklist.slice(0, 8) });
  } catch (error) {
    const message =
      error instanceof Anthropic.RateLimitError
        ? "Limite da IA atingido. Tente de novo em alguns minutos."
        : error instanceof Anthropic.AuthenticationError
          ? "Chave da IA inválida (ANTHROPIC_API_KEY)."
          : "Falha ao gerar o resumo. Tente de novo.";
    console.error("generateLessonSummary", error);
    await setStatus({ ai_status: "error", ai_error: message });
  }
}
