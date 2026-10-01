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

const optionalDateTime = () =>
  z
    .string()
    .optional()
    .nullable()
    .transform((v, ctx) => {
      if (!v) return null;
      const iso = zonedInputToIso(v);
      if (!iso) {
        ctx.addIssue({ code: "custom", message: "Data inválida." });
        return z.NEVER;
      }
      return iso;
    });

// ---------------------------------------------------------------------------
// Criar / editar
// ---------------------------------------------------------------------------

const createSchema = z.object({
  course_id: z.uuid("Escolha o curso."),
  name: formFields.text("Dê um nome à turma."),
});

export async function createCohort(_prev: FormState | undefined, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = parseForm(createSchema, formData);
  if (!parsed.success) return parsed.state;

  const supabase = await createClient();
  const { data: cohort, error } = await supabase.from("cohorts").insert(parsed.data).select("id").single();
  if (error) return { ok: false, message: dbErrorMessage(error) };

  // Começa com todas as aulas do curso, na ordem do curso.
  const { data: modules } = await supabase
    .from("modules")
    .select("lessons(id, position)")
    .eq("course_id", parsed.data.course_id)
    .order("position")
    .order("position", { referencedTable: "lessons" });
  const items = (modules ?? []).flatMap((m) => m.lessons.map((l) => ({ lesson_id: l.id, release_at: null, release_offset_days: null })));
  if (items.length) {
    await supabase.rpc("set_cohort_lessons", { p_cohort_id: cohort.id, p_items: items });
  }

  redirect(`/admin/turmas/${cohort.id}`);
}

const updateSchema = z.object({
  name: formFields.text("Dê um nome à turma."),
  description: formFields.optionalText(),
  release_mode: z.enum(["all", "weekly", "fixed_date", "days_after_join"]),
  weekday: z.string().nullable(),
  time: z.string().nullable(),
  interval_days: formFields.optionalInt(),
  starts_at: optionalDateTime(),
  ends_at: optionalDateTime(),
  access: z.enum(["lifetime", "months"]),
  access_months: formFields.optionalInt(1),
  access_starts_from: z
    .enum(["purchase", "cohort_start"])
    .nullable()
    .transform((v) => v ?? "purchase"),
  checkout_url: formFields.optionalUrl(),
  live_url: formFields.optionalUrl(),
  is_active: formFields.checkbox(),
});

export async function updateCohort(cohortId: string, _prev: FormState | undefined, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = parseForm(updateSchema, formData);
  if (!parsed.success) return parsed.state;
  const { weekday, time, interval_days, access, access_months, access_starts_from, ...d } = parsed.data;

  let release_config: Record<string, string | number> = {};
  if (d.release_mode === "weekly") {
    if (!weekday || !/^[0-6]$/.test(weekday)) return { ok: false, errors: { weekday: ["Escolha o dia da semana."] } };
    if (!time || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { ok: false, errors: { time: ["Informe o horário (ex.: 19:00)."] } };
    release_config = { weekday: Number(weekday), time };
  } else if (d.release_mode === "days_after_join") {
    release_config = { interval_days: interval_days ?? 7 };
  }
  if (access === "months" && !access_months) {
    return { ok: false, errors: { access_months: ["Informe em quantos meses o acesso expira."] } };
  }
  if (access === "months" && access_starts_from === "cohort_start" && !d.starts_at) {
    return { ok: false, errors: { access_starts_from: ["Para contar do início da turma, preencha a data de início."] } };
  }
  if (d.starts_at && d.ends_at && d.ends_at <= d.starts_at) {
    return { ok: false, errors: { ends_at: ["O fim precisa ser depois do início."] } };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("cohorts")
    .update({ ...d, release_config, access_months: access === "months" ? access_months : null, access_starts_from })
    .eq("id", cohortId);
  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidatePath(`/admin/turmas/${cohortId}`);
  revalidatePath("/admin/turmas");
  return { ok: true, message: "Turma salva." };
}

// ---------------------------------------------------------------------------
// Aulas da turma
// ---------------------------------------------------------------------------

const lessonsSchema = z.array(
  z.object({
    lesson_id: z.uuid(),
    release_at: z.string().nullable(), // datetime-local (São Paulo) ou null
    release_offset_days: z.number().int().min(0).max(3650).nullable(),
  }),
);

export async function saveCohortLessons(cohortId: string, items: z.input<typeof lessonsSchema>): Promise<FormState> {
  await requireAdmin();
  const parsed = lessonsSchema.safeParse(items);
  if (!parsed.success) return { ok: false, message: "Dados inválidos." };

  const payload = [];
  for (const item of parsed.data) {
    const releaseAt = item.release_at ? zonedInputToIso(item.release_at) : null;
    if (item.release_at && !releaseAt) return { ok: false, message: "Há uma data inválida." };
    payload.push({ ...item, release_at: releaseAt });
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_cohort_lessons", { p_cohort_id: cohortId, p_items: payload });
  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidatePath(`/admin/turmas/${cohortId}`);
  return { ok: true, message: "Aulas da turma salvas." };
}

// ---------------------------------------------------------------------------
// Produtos do checkout
// ---------------------------------------------------------------------------

const productSchema = z.object({
  provider: z.enum(["kiwify", "hotmart", "yampi", "mercadopago", "asaas"], "Escolha a plataforma."),
  external_product_id: formFields.text("Informe o ID do produto na plataforma."),
  label: formFields.optionalText(),
});

export async function addCohortProduct(cohortId: string, _prev: FormState | undefined, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = parseForm(productSchema, formData);
  if (!parsed.success) return parsed.state;

  const supabase = await createClient();
  const { error } = await supabase.from("cohort_products").insert({ ...parsed.data, cohort_id: cohortId });
  if (error) {
    return {
      ok: false,
      message:
        error.code === "23505" ? "Esse produto já está ligado a uma turma. Cada produto libera uma única turma." : dbErrorMessage(error),
    };
  }
  revalidatePath(`/admin/turmas/${cohortId}`);
  return { ok: true, message: "Produto ligado." };
}

export async function removeCohortProduct(productId: string, cohortId: string) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("cohort_products").delete().eq("id", productId);
  revalidatePath(`/admin/turmas/${cohortId}`);
}

// ---------------------------------------------------------------------------
// Alunos
// ---------------------------------------------------------------------------

const enrollSchema = z.object({
  email: z.email("Informe um e-mail válido.").trim().toLowerCase(),
  full_name: formFields.optionalText(),
});

export async function enrollByEmail(cohortId: string, _prev: FormState | undefined, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = parseForm(enrollSchema, formData);
  if (!parsed.success) return parsed.state;

  const userId = await findOrCreateUser({ email: parsed.data.email, fullName: parsed.data.full_name });
  const supabase = await createClient();
  const { error } = await supabase.rpc("enroll_user", { p_user_id: userId, p_cohort_id: cohortId, p_origin: "manual" });
  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidatePath(`/admin/turmas/${cohortId}`);
  return { ok: true, message: `${parsed.data.email} matriculado(a). O acesso é pelo link mágico em /entrar.` };
}

// ---------------------------------------------------------------------------
// Duplicar / excluir
// ---------------------------------------------------------------------------

export async function duplicateCohort(cohortId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("duplicate_cohort", { p_cohort_id: cohortId });
  if (error || !data) throw new Error(dbErrorMessage(error ?? { message: "" }, "Não foi possível duplicar a turma."));
  revalidatePath("/admin/turmas");
  redirect(`/admin/turmas/${data}`);
}

export async function deleteCohort(cohortId: string, courseId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("cohorts").delete().eq("id", cohortId);
  if (error) throw new Error(dbErrorMessage(error, "Não foi possível excluir a turma."));
  revalidatePath("/admin/turmas");
  revalidatePath(`/admin/cursos/${courseId}`);
  redirect("/admin/turmas");
}
