"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/components/ui/form-message";
import { requireAdmin } from "@/lib/auth";
import { dbErrorMessage, formFields, parseForm } from "@/lib/forms";
import { slugify } from "@/lib/slug";
import { createClient } from "@/lib/supabase/server";

const slugField = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use só letras minúsculas, números e hífen (ex.: ia-negocios-locais).");

// ---------------------------------------------------------------------------
// Curso
// ---------------------------------------------------------------------------

const createSchema = z.object({
  title: formFields.text("Dê um título ao curso."),
  slug: formFields.optionalText(),
});

export async function createCourse(_prev: FormState | undefined, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = parseForm(createSchema, formData);
  if (!parsed.success) return parsed.state;

  const slug = slugField.safeParse(parsed.data.slug ?? slugify(parsed.data.title));
  if (!slug.success) return { ok: false, errors: { slug: [slug.error.issues[0].message] } };

  const supabase = await createClient();
  const { data, error } = await supabase.from("courses").insert({ title: parsed.data.title, slug: slug.data }).select("id").single();
  if (error) return { ok: false, message: dbErrorMessage(error) };

  redirect(`/admin/cursos/${data.id}`);
}

const updateSchema = z.object({
  title: formFields.text("Dê um título ao curso."),
  slug: slugField,
  description: formFields.optionalText(),
  is_free: formFields.checkbox(),
  lead_fields: z
    .enum(["email", "whatsapp", "name_email", "name_email_whatsapp"])
    .nullable()
    .transform((v) => v ?? undefined), // fora do formulário quando o curso não é grátis: mantém o que estava
  lead_access: z
    .enum(["direct", "confirm_email"])
    .nullable()
    .transform((v) => v ?? undefined),
  is_published: formFields.checkbox(),
  showcase_order: formFields.optionalInt(),
  sales_cohort_id: formFields.optionalUuid(),
  cover_vertical_url: formFields.optionalUrl(),
  cover_horizontal_url: formFields.optionalUrl(),
  banner_url: formFields.optionalUrl(),
  preview_video_provider: z
    .string()
    .nullable()
    .transform((v, ctx) => {
      if (!v) return null;
      if (v !== "youtube" && v !== "bunny") {
        ctx.addIssue({ code: "custom", message: "Escolha onde está o vídeo." });
        return z.NEVER;
      }
      return v;
    }),
  preview_video_id: formFields.optionalText(),
  preview_start_seconds: formFields.optionalDuration(),
  preview_end_seconds: formFields.optionalDuration(),
  module_layout: z.enum(["cards", "list"]),
  certificate_enabled: formFields.checkbox(),
  certificate_hours: formFields.optionalInt(),
  next_course_id: formFields.optionalUuid(),
});

export async function updateCourse(courseId: string, _prev: FormState | undefined, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = parseForm(updateSchema, formData);
  if (!parsed.success) return parsed.state;
  const d = parsed.data;

  if (d.preview_start_seconds !== null && d.preview_end_seconds !== null && d.preview_end_seconds <= d.preview_start_seconds) {
    return { ok: false, errors: { preview_end_seconds: ["O fim da prévia precisa ser depois do início."] } };
  }
  if (d.preview_video_id && !d.preview_video_provider) {
    return { ok: false, errors: { preview_video_provider: ["Escolha onde está o vídeo da prévia."] } };
  }
  if (!d.preview_video_id) d.preview_video_provider = null;
  if (d.certificate_hours !== null && (d.certificate_hours < 1 || d.certificate_hours > 10000)) {
    return { ok: false, errors: { certificate_hours: ["Use um número de horas entre 1 e 10.000."] } };
  }
  if (d.next_course_id === courseId) {
    return { ok: false, errors: { next_course_id: ["Escolha outro curso."] } };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("courses")
    .update({ ...d, showcase_order: d.showcase_order ?? 0 })
    .eq("id", courseId);
  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidatePath("/admin/cursos", "layout");
  return { ok: true, message: "Curso salvo." };
}

export async function deleteCourse(courseId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("courses").delete().eq("id", courseId);
  if (error) throw new Error(dbErrorMessage(error, "Não foi possível excluir o curso."));
  revalidatePath("/admin/cursos");
  redirect("/admin/cursos");
}

// ---------------------------------------------------------------------------
// Módulos
// ---------------------------------------------------------------------------

export async function createModule(courseId: string, formData: FormData) {
  await requireAdmin();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const supabase = await createClient();
  const { count } = await supabase.from("modules").select("*", { count: "exact", head: true }).eq("course_id", courseId);
  await supabase.from("modules").insert({ course_id: courseId, title, position: count ?? 0 });
  revalidatePath(`/admin/cursos/${courseId}`);
}

export async function updateModule(moduleId: string, courseId: string, formData: FormData) {
  await requireAdmin();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const description =
    String(formData.get("description") ?? "")
      .trim()
      .slice(0, 600) || null;
  const coverRaw = String(formData.get("cover_url") ?? "").trim();
  const cover_url = /^https:\/\//.test(coverRaw) ? coverRaw : null;
  const supabase = await createClient();
  await supabase.from("modules").update({ title, description, cover_url }).eq("id", moduleId);
  revalidatePath(`/admin/cursos/${courseId}`);
}

export async function deleteModule(moduleId: string, courseId: string) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("modules").delete().eq("id", moduleId);
  revalidatePath(`/admin/cursos/${courseId}`);
}

/** Nova ordem de ids depois de trocar `id` com o vizinho; null se não dá para mover. */
function swapWithNeighbor(ids: string[], id: string, direction: "up" | "down"): string[] | null {
  const from = ids.indexOf(id);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= ids.length) return null;
  const next = [...ids];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

async function move(table: "modules" | "lessons", id: string, direction: "up" | "down") {
  const supabase = await createClient();
  let siblings: { id: string }[] | null = null;

  if (table === "modules") {
    const { data: current } = await supabase.from("modules").select("course_id").eq("id", id).single();
    if (!current) return;
    ({ data: siblings } = await supabase
      .from("modules")
      .select("id")
      .eq("course_id", current.course_id)
      .order("position")
      .order("created_at"));
  } else {
    const { data: current } = await supabase.from("lessons").select("module_id").eq("id", id).single();
    if (!current) return;
    ({ data: siblings } = await supabase
      .from("lessons")
      .select("id")
      .eq("module_id", current.module_id)
      .order("position")
      .order("created_at"));
  }

  const ids = swapWithNeighbor(
    (siblings ?? []).map((s) => s.id),
    id,
    direction,
  );
  if (!ids) return;
  await Promise.all(ids.map((siblingId, position) => supabase.from(table).update({ position }).eq("id", siblingId)));
}

export async function moveModule(moduleId: string, courseId: string, direction: "up" | "down") {
  await requireAdmin();
  await move("modules", moduleId, direction);
  revalidatePath(`/admin/cursos/${courseId}`);
}

// ---------------------------------------------------------------------------
// Aulas (criação e ordem; edição completa em aulas/actions.ts)
// ---------------------------------------------------------------------------

export async function createLesson(moduleId: string, courseId: string, formData: FormData) {
  await requireAdmin();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const supabase = await createClient();
  const { count } = await supabase.from("lessons").select("*", { count: "exact", head: true }).eq("module_id", moduleId);
  const { data, error } = await supabase
    .from("lessons")
    .insert({ module_id: moduleId, title, position: count ?? 0 })
    .select("id")
    .single();
  if (error || !data) throw new Error(dbErrorMessage(error ?? { message: "" }, "Não foi possível criar a aula."));
  await supabase.from("lesson_contents").insert({ lesson_id: data.id });
  redirect(`/admin/cursos/${courseId}/aulas/${data.id}`);
}

export async function moveLesson(lessonId: string, courseId: string, direction: "up" | "down") {
  await requireAdmin();
  await move("lessons", lessonId, direction);
  revalidatePath(`/admin/cursos/${courseId}`);
}
