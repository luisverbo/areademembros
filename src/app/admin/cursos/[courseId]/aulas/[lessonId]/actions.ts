"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import type { FormState } from "@/components/ui/form-message";
import { requireAdmin } from "@/lib/auth";
import { dbErrorMessage, formFields, parseForm } from "@/lib/forms";
import { isAiConfigured } from "@/lib/ai/client";
import { generateLessonSummary } from "@/lib/ai/lesson-summary";
import { parseChecklistLines, parseSummaryLines } from "@/lib/summary-text";
import { createClient } from "@/lib/supabase/server";
import { parseTranscript } from "@/lib/transcript";
import { normalizeVideoId } from "@/lib/video";

const schema = z.object({
  title: formFields.text("Dê um título à aula."),
  description: formFields.optionalText(),
  module_id: z.uuid("Escolha o módulo."),
  thumbnail_url: formFields.optionalUrl(),
  duration_seconds: formFields.optionalDuration(),
  is_free: formFields.checkbox(),
  is_published: formFields.checkbox(),
  video_provider: z.enum(["bunny", "youtube"]),
  video_id: formFields.optionalText(),
  offer_at_seconds: formFields.optionalDuration(),
  offer_label: formFields.optionalText(),
  offer_url: formFields.optionalUrl(),
});

export async function updateLesson(
  lessonId: string,
  courseId: string,
  _prev: FormState | undefined,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();
  const parsed = parseForm(schema, formData);
  if (!parsed.success) return parsed.state;
  const { video_provider, video_id: rawVideoId, ...lesson } = parsed.data;

  const videoId = rawVideoId ? normalizeVideoId(video_provider, rawVideoId) : null;
  if (rawVideoId && !videoId) {
    return {
      ok: false,
      errors: {
        video_id: [
          video_provider === "bunny" ? "Cole o ID (GUID) do vídeo no Bunny ou o link de embed." : "Cole o ID ou o link do YouTube.",
        ],
      },
    };
  }

  const supabase = await createClient();
  // YouTube liberado também em aula paga (decisão de 01/10/2026, até assinar o Bunny).
  // O admin mostra o aviso de que o vídeo fica menos protegido.
  if (lesson.is_published && !videoId) {
    return { ok: false, errors: { video_id: ["Para publicar, informe o vídeo da aula."] } };
  }
  const offerFields = [lesson.offer_at_seconds, lesson.offer_label, lesson.offer_url];
  if (offerFields.some((v) => v !== null) && offerFields.some((v) => v === null)) {
    return { ok: false, message: "Para o botão de oferta, preencha minuto, texto e link (ou deixe os três vazios)." };
  }

  const { error } = await supabase.from("lessons").update(lesson).eq("id", lessonId);
  if (error) return { ok: false, message: dbErrorMessage(error) };

  const { error: contentError } = await supabase.from("lesson_contents").upsert({ lesson_id: lessonId, video_provider, video_id: videoId });
  if (contentError) return { ok: false, message: dbErrorMessage(contentError) };

  revalidatePath(`/admin/cursos/${courseId}`, "layout");
  return { ok: true, message: "Aula salva." };
}

export async function deleteLesson(lessonId: string, courseId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { data: materials } = await supabase.from("lesson_materials").select("storage_path").eq("lesson_id", lessonId);
  const { error } = await supabase.from("lessons").delete().eq("id", lessonId);
  if (error) throw new Error(dbErrorMessage(error, "Não foi possível excluir a aula."));
  if (materials?.length) {
    await supabase.storage.from("lesson-materials").remove(materials.map((m) => m.storage_path));
  }
  revalidatePath(`/admin/cursos/${courseId}`);
  redirect(`/admin/cursos/${courseId}`);
}

const materialSchema = z.object({
  name: z.string().trim().min(1).max(200),
  storage_path: z.string().min(1),
  file_type: z.string().max(200).nullable(),
  size_bytes: z.number().int().nonnegative().nullable(),
});

export async function addMaterial(lessonId: string, courseId: string, input: z.input<typeof materialSchema>): Promise<FormState> {
  await requireAdmin();
  const parsed = materialSchema.safeParse(input);
  if (!parsed.success || !parsed.data.storage_path.startsWith(`${lessonId}/`)) {
    return { ok: false, message: "Arquivo inválido." };
  }
  const supabase = await createClient();
  const { count } = await supabase.from("lesson_materials").select("*", { count: "exact", head: true }).eq("lesson_id", lessonId);
  const { error } = await supabase.from("lesson_materials").insert({ ...parsed.data, lesson_id: lessonId, position: count ?? 0 });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/admin/cursos/${courseId}/aulas/${lessonId}`);
  return { ok: true };
}

export async function deleteMaterial(materialId: string, lessonId: string, courseId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("lesson_materials").delete().eq("id", materialId).select("storage_path").single();
  if (data) await supabase.storage.from("lesson-materials").remove([data.storage_path]);
  revalidatePath(`/admin/cursos/${courseId}/aulas/${lessonId}`);
}

// ---------------------------------------------------------------------------
// Transcrição e IA (Etapa 2A)
// ---------------------------------------------------------------------------

export async function saveTranscript(
  lessonId: string,
  courseId: string,
  _prev: FormState | undefined,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();
  const raw = String(formData.get("transcript") ?? "");
  if (raw.length > 2_000_000) return { ok: false, message: "Transcrição muito grande (máx. 2 MB de texto)." };
  const parsed = parseTranscript(raw);
  // IA só roda se houver chave configurada (decisão de 03/10/2026: não gastar com IA por padrão).
  const aiOn = isAiConfigured();

  const supabase = await createClient();
  const { error: delError } = await supabase.from("lesson_transcript_segments").delete().eq("lesson_id", lessonId);
  if (delError) return { ok: false, message: dbErrorMessage(delError) };

  if (parsed.segments.length) {
    const rows = parsed.segments.map((s) => ({ lesson_id: lessonId, start_seconds: s.start, end_seconds: s.end, text: s.text }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from("lesson_transcript_segments").insert(rows.slice(i, i + 500));
      if (error) return { ok: false, message: dbErrorMessage(error) };
    }
  }
  const { error } = await supabase.from("lesson_contents").upsert({
    lesson_id: lessonId,
    transcript: parsed.text || null,
    ai_status: parsed.segments.length ? "processing" : "idle",
    ai_error: null,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };

  if (parsed.segments.length && aiOn) after(() => generateLessonSummary(lessonId));
  revalidatePath(`/admin/cursos/${courseId}/aulas/${lessonId}`);
  return {
    ok: true,
    message: parsed.segments.length
      ? `Transcrição salva (${parsed.segments.length} trechos${parsed.hasTimestamps ? ", com minutos" : ", sem minutos"}).${aiOn ? " A IA está gerando o resumo." : ""}`
      : "Transcrição removida.",
  };
}

export async function regenerateSummary(lessonId: string, courseId: string) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("lesson_contents").update({ ai_status: "processing", ai_error: null }).eq("lesson_id", lessonId);
  after(() => generateLessonSummary(lessonId));
  revalidatePath(`/admin/cursos/${courseId}/aulas/${lessonId}`);
}

/** Resumo e checklist escritos pelo admin (sem IA, sem custo). */
export async function saveManualSummary(
  lessonId: string,
  courseId: string,
  _prev: FormState | undefined,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();
  const points = parseSummaryLines(String(formData.get("summary") ?? ""));
  const checklist = parseChecklistLines(String(formData.get("checklist") ?? ""));
  const supabase = await createClient();
  const { error } = await supabase.from("lesson_contents").upsert({
    lesson_id: lessonId,
    ai_summary: points.length ? { points } : null,
    ai_checklist: checklist.length ? checklist : null,
    ai_status: points.length || checklist.length ? "ready" : "idle",
    ai_error: null,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/admin/cursos/${courseId}/aulas/${lessonId}`);
  return { ok: true, message: points.length || checklist.length ? "Resumo salvo. Já aparece na aula." : "Resumo removido." };
}
