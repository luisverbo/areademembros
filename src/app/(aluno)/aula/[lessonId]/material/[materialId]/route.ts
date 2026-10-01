import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Baixa um material: confere o acesso (RLS) e redireciona para um link temporário do Storage. */
export async function GET(request: NextRequest, { params }: RouteContext<"/aula/[lessonId]/material/[materialId]">) {
  const { lessonId, materialId } = await params;
  const supabase = await createClient();
  const { data: material } = await supabase
    .from("lesson_materials")
    .select("name, storage_path")
    .eq("id", materialId)
    .eq("lesson_id", lessonId)
    .maybeSingle();
  if (!material) return NextResponse.redirect(new URL(`/aula/${lessonId}`, request.nextUrl.origin));

  const { data } = await supabase.storage.from("lesson-materials").createSignedUrl(material.storage_path, 60, { download: material.name });
  if (!data?.signedUrl) return NextResponse.redirect(new URL(`/aula/${lessonId}`, request.nextUrl.origin));
  return NextResponse.redirect(data.signedUrl);
}
