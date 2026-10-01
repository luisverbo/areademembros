"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type NoteDTO = { id: string; content: string; timestamp_seconds: number | null; updated_at: string };

export async function createNote(lessonId: string, timestampSeconds: number | null): Promise<NoteDTO | null> {
  const profile = await requireUser();
  const ts = timestampSeconds !== null && Number.isFinite(timestampSeconds) && timestampSeconds >= 0 ? Math.floor(timestampSeconds) : null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("notes")
    .insert({ user_id: profile.id, lesson_id: lessonId, content: "", timestamp_seconds: ts })
    .select("id, content, timestamp_seconds, updated_at")
    .single();
  revalidatePath("/caderno");
  return data;
}

const contentSchema = z.string().max(20000);

export async function updateNote(noteId: string, content: string): Promise<{ ok: boolean; updated_at?: string }> {
  await requireUser();
  const parsed = contentSchema.safeParse(content);
  if (!parsed.success) return { ok: false };
  const supabase = await createClient();
  const { data, error } = await supabase.from("notes").update({ content: parsed.data }).eq("id", noteId).select("updated_at").single();
  if (error || !data) return { ok: false };
  return { ok: true, updated_at: data.updated_at };
}

export async function deleteNote(noteId: string): Promise<void> {
  await requireUser();
  const supabase = await createClient();
  await supabase.from("notes").delete().eq("id", noteId);
  revalidatePath("/caderno");
}
