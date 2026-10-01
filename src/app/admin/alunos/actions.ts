"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/components/ui/form-message";
import { requireAdmin } from "@/lib/auth";
import { zonedInputToIso } from "@/lib/datetime";
import { dbErrorMessage, formFields, parseForm } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { findOrCreateUser } from "@/lib/users";

const newStudentSchema = z.object({
  email: z.email("Informe um e-mail válido.").trim().toLowerCase(),
  full_name: formFields.optionalText(),
  whatsapp: formFields.optionalText(),
  cohort_id: formFields.optionalUuid(),
});

export async function createStudent(_prev: FormState | undefined, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = parseForm(newStudentSchema, formData);
  if (!parsed.success) return parsed.state;
  const { email, full_name, whatsapp, cohort_id } = parsed.data;

  const userId = await findOrCreateUser({ email, fullName: full_name, whatsapp });
  if (cohort_id) {
    const supabase = await createClient();
    const { error } = await supabase.rpc("enroll_user", { p_user_id: userId, p_cohort_id: cohort_id, p_origin: "manual" });
    if (error) return { ok: false, message: dbErrorMessage(error) };
  }
  redirect(`/admin/alunos/${userId}`);
}

const profileSchema = z.object({
  full_name: formFields.optionalText(),
  whatsapp: formFields.optionalText(),
  role: z.enum(["student", "admin"]),
});

export async function updateStudent(userId: string, _prev: FormState | undefined, formData: FormData): Promise<FormState> {
  const me = await requireAdmin();
  const parsed = parseForm(profileSchema, formData);
  if (!parsed.success) return parsed.state;
  if (userId === me.id && parsed.data.role !== "admin") {
    return { ok: false, errors: { role: ["Você não pode remover o seu próprio acesso de admin."] } };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update(parsed.data).eq("id", userId);
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/admin/alunos/${userId}`);
  return { ok: true, message: "Dados salvos." };
}

export async function enrollStudent(userId: string, _prev: FormState | undefined, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const cohortId = z.uuid().safeParse(formData.get("cohort_id"));
  if (!cohortId.success) return { ok: false, errors: { cohort_id: ["Escolha a turma."] } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("enroll_user", { p_user_id: userId, p_cohort_id: cohortId.data, p_origin: "manual" });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/admin/alunos/${userId}`);
  return { ok: true, message: "Matrícula feita." };
}

const enrollmentSchema = z.object({
  cohort_id: z.uuid(),
  status: z.enum(["active", "refunded", "expired"]),
  expires_at: z.string().nullable(),
});

/** Muda de turma, status ou prazo. Mudar de turma mantém a data de entrada e o progresso. */
export async function updateEnrollment(
  enrollmentId: string,
  userId: string,
  _prev: FormState | undefined,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();
  const parsed = parseForm(enrollmentSchema, formData);
  if (!parsed.success) return parsed.state;
  const expiresAt = parsed.data.expires_at ? zonedInputToIso(parsed.data.expires_at) : null;
  if (parsed.data.expires_at && !expiresAt) return { ok: false, message: "Data de expiração inválida." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("enrollments")
    .update({ cohort_id: parsed.data.cohort_id, status: parsed.data.status, expires_at: expiresAt })
    .eq("id", enrollmentId);
  if (error) {
    return { ok: false, message: error.code === "23505" ? "O aluno já está matriculado nessa turma." : dbErrorMessage(error) };
  }
  revalidatePath(`/admin/alunos/${userId}`);
  return { ok: true, message: "Matrícula atualizada." };
}

export async function deleteEnrollment(enrollmentId: string, userId: string) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("enrollments").delete().eq("id", enrollmentId);
  revalidatePath(`/admin/alunos/${userId}`);
}

export async function unlockLesson(userId: string, _prev: FormState | undefined, formData: FormData): Promise<FormState> {
  const me = await requireAdmin();
  const lessonId = z.uuid().safeParse(formData.get("lesson_id"));
  if (!lessonId.success) return { ok: false, errors: { lesson_id: ["Escolha a aula."] } };
  const supabase = await createClient();
  const { error } = await supabase
    .from("lesson_unlocks")
    .upsert({ user_id: userId, lesson_id: lessonId.data, created_by: me.id }, { onConflict: "user_id,lesson_id", ignoreDuplicates: true });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/admin/alunos/${userId}`);
  return { ok: true, message: "Aula liberada para o aluno." };
}

export async function removeUnlock(userId: string, lessonId: string) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("lesson_unlocks").delete().eq("user_id", userId).eq("lesson_id", lessonId);
  revalidatePath(`/admin/alunos/${userId}`);
}
