"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/ui/form-message";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const replySchema = z.object({
  commentId: z.uuid(),
  content: z.string().trim().min(1, "Escreva a resposta.").max(5000, "Resposta muito longa (máx. 5.000 caracteres)."),
});

/** Responde na própria conversa da aula (o aluno vê a resposta embaixo do comentário). */
export async function replyToComment(_prev: FormState | undefined, formData: FormData): Promise<FormState> {
  const profile = await requireAdmin();
  const parsed = replySchema.safeParse({ commentId: formData.get("commentId"), content: formData.get("content") });
  if (!parsed.success) return { ok: false, errors: { content: [parsed.error.issues[0].message] } };

  const supabase = await createClient();
  const { data: comment } = await supabase
    .from("comments")
    .select("id, parent_id, lesson_id, cohort_id")
    .eq("id", parsed.data.commentId)
    .maybeSingle();
  if (!comment) return { ok: false, message: "Comentário não encontrado (pode ter sido apagado)." };

  const { error } = await supabase.from("comments").insert({
    lesson_id: comment.lesson_id,
    cohort_id: comment.cohort_id,
    parent_id: comment.parent_id ?? comment.id,
    user_id: profile.id,
    content: parsed.data.content,
  });
  if (error) return { ok: false, message: "Não foi possível enviar a resposta." };
  revalidatePath("/admin/radar");
  revalidatePath(`/aula/${comment.lesson_id}`);
  return { ok: true };
}

export async function setCommentHandled(commentId: string, handled: boolean) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_comment_handled", { p_comment_id: commentId, p_handled: handled });
  if (error) throw new Error("Não foi possível atualizar o comentário.");
  revalidatePath("/admin/radar");
}
