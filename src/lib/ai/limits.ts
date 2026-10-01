import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Limite diário de perguntas à IA por aluno (protege o custo). Admin não tem limite. */
export const DAILY_AI_QUESTIONS = 40;

export async function aiQuestionsUsedToday(): Promise<number> {
  const supabase = await createClient();
  const since = new Date();
  since.setUTCHours(3, 0, 0, 0); // meia-noite em Brasília (UTC-3)
  if (since.getTime() > Date.now()) since.setUTCDate(since.getUTCDate() - 1);
  const [{ count: chat }, { count: search }] = await Promise.all([
    supabase.from("ai_messages").select("id", { count: "exact", head: true }).eq("role", "user").gte("created_at", since.toISOString()),
    supabase.from("ai_searches").select("id", { count: "exact", head: true }).gte("created_at", since.toISOString()),
  ]);
  return (chat ?? 0) + (search ?? 0);
}
