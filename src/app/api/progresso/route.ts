import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  lessonId: z.uuid(),
  position: z
    .number()
    .int()
    .min(0)
    .max(24 * 3600),
  duration: z
    .number()
    .int()
    .min(1)
    .max(24 * 3600),
});

/** Recebe o ponto do vídeo enviado pelo player. O RLS garante que só grava em aula liberada. */
export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { lessonId, position, duration } = parsed.data;
  const { error } = await supabase.rpc("record_lesson_progress", {
    p_lesson_id: lessonId,
    p_position_seconds: Math.min(position, duration),
    p_duration_seconds: duration,
  });
  if (error) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ ok: true });
}
