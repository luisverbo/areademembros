import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AI_BETAS, AI_MODEL, aiClient, isAiConfigured } from "@/lib/ai/client";
import { aiQuestionsUsedToday, DAILY_AI_QUESTIONS } from "@/lib/ai/limits";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { transcriptForPrompt } from "@/lib/transcript";

export const maxDuration = 60;

const schema = z.object({ lessonId: z.uuid(), message: z.string().trim().min(1).max(2000) });

const SYSTEM = `Você é o Professor IA da área de membros: um tutor paciente que tira dúvidas sobre UMA aula específica, para alunos brasileiros donos de pequenos negócios.
Responda em português do Brasil, curto e prático (até 3 parágrafos curtos ou uma lista curta). Latency-sensitive; begin your visible answer immediately.
Baseie a resposta na transcrição da aula abaixo. Sempre que usar algo da aula, cite o minuto no formato [mm:ss] exatamente como aparece na transcrição, para o aluno clicar e ir ao ponto do vídeo.
Se a pergunta não for coberta pela aula, diga isso com clareza e dê só uma orientação geral breve, sem inventar o que a aula ensina.
Não use markdown de títulos nem tabelas.`;

function plain(message: string, status = 200) {
  return new NextResponse(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

export async function POST(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) return plain("Entre na sua conta para usar o Professor IA.", 401);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return plain("Pergunta inválida.", 400);
  if (!isAiConfigured()) return plain("O Professor IA ainda não está ativado nesta área.", 503);

  const { lessonId, message } = parsed.data;
  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("can_access_lesson", { p_lesson_id: lessonId });
  if (!allowed) return plain("Você não tem acesso a esta aula.", 403);

  if (profile.role !== "admin" && (await aiQuestionsUsedToday()) >= DAILY_AI_QUESTIONS) {
    return plain(`Você chegou ao limite de ${DAILY_AI_QUESTIONS} perguntas por dia. Volte amanhã!`, 429);
  }

  // Conversa da aula (uma por aluno) e histórico recente.
  let { data: conversation } = await supabase
    .from("ai_conversations")
    .select("id")
    .eq("user_id", profile.id)
    .eq("lesson_id", lessonId)
    .maybeSingle();
  if (!conversation) {
    ({ data: conversation } = await supabase
      .from("ai_conversations")
      .insert({ user_id: profile.id, lesson_id: lessonId })
      .select("id")
      .single());
  }
  if (!conversation) return plain("Não foi possível abrir a conversa.", 500);

  const [{ data: history }, { data: lesson }, { data: segments }] = await Promise.all([
    supabase
      .from("ai_messages")
      .select("role, content")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("lessons").select("title").eq("id", lessonId).single(),
    supabase.from("lesson_transcript_segments").select("start_seconds, text").eq("lesson_id", lessonId).order("start_seconds"),
  ]);
  await supabase.from("ai_messages").insert({ conversation_id: conversation.id, role: "user", content: message });

  const hasTimestamps = (segments ?? []).some((s) => s.start_seconds > 0);
  const lessonContext = segments?.length
    ? `Aula: ${lesson?.title}\n\nTranscrição${hasTimestamps ? "" : " (sem minutos: não cite minutos)"}:\n${transcriptForPrompt(segments, hasTimestamps)}`
    : `Aula: ${lesson?.title}\n\nEsta aula ainda não tem transcrição. Diga ao aluno que você ainda não conhece o conteúdo desta aula e responda só de forma geral.`;

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...(history ?? []).reverse().map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user", content: message },
  ];

  const stream = aiClient().beta.messages.stream({
    model: AI_MODEL,
    max_tokens: 8000,
    betas: AI_BETAS,
    fallbacks: "default",
    output_config: { effort: "low" },
    // Transcrição em bloco fixo com cache: as próximas perguntas da mesma aula saem mais baratas.
    system: [
      { type: "text", text: SYSTEM },
      { type: "text", text: lessonContext, cache_control: { type: "ephemeral" } },
    ],
    messages,
  });

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let answer = "";
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            answer += event.delta.text;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal" && !answer) {
          answer = "Não consigo ajudar com essa pergunta. Tente perguntar de outro jeito sobre o conteúdo da aula.";
          controller.enqueue(encoder.encode(answer));
        }
      } catch (error) {
        console.error("professor ia", error);
        const fail =
          error instanceof Anthropic.RateLimitError
            ? "\n\n(A IA está ocupada agora. Tente de novo em instantes.)"
            : "\n\n(Não consegui terminar a resposta. Tente de novo.)";
        answer += fail;
        controller.enqueue(encoder.encode(fail));
      } finally {
        if (answer.trim())
          await supabase
            .from("ai_messages")
            .insert({ conversation_id: conversation!.id, role: "assistant", content: answer.slice(0, 20000) });
        controller.close();
      }
    },
  });

  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
