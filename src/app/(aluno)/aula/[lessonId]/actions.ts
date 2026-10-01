"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/ui/form-message";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function setLessonCompleted(lessonId: string, completed: boolean) {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_lesson_completed", { p_lesson_id: lessonId, p_completed: completed });
  if (error) throw new Error("Não foi possível atualizar a aula.");
  revalidatePath(`/aula/${lessonId}`);
}

const commentSchema = z.object({
  content: z.string().trim().min(1, "Escreva o comentário.").max(5000, "Comentário muito longo (máx. 5.000 caracteres)."),
  parentId: z.uuid().nullable(),
});

export async function addComment(
  lessonId: string,
  cohortId: string | null,
  _prev: FormState | undefined,
  formData: FormData,
): Promise<FormState> {
  const profile = await requireUser();
  const parsed = commentSchema.safeParse({ content: formData.get("content"), parentId: formData.get("parentId") || null });
  if (!parsed.success) return { ok: false, errors: { content: [parsed.error.issues[0].message] } };

  const supabase = await createClient();
  const { error } = await supabase.from("comments").insert({
    lesson_id: lessonId,
    cohort_id: cohortId,
    user_id: profile.id,
    parent_id: parsed.data.parentId,
    content: parsed.data.content,
  });
  if (error) return { ok: false, message: "Não foi possível publicar o comentário." };
  revalidatePath(`/aula/${lessonId}`);
  return { ok: true };
}

export async function deleteComment(commentId: string, lessonId: string) {
  await requireUser();
  const supabase = await createClient();
  await supabase.from("comments").delete().eq("id", commentId);
  revalidatePath(`/aula/${lessonId}`);
}
