import { NextResponse, type NextRequest } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { getNotebook } from "@/lib/notes-data";
import { notebookToDocx, notebookToPdf } from "@/lib/notes-export";
import { slugify } from "@/lib/slug";

const UUID = /^[0-9a-f-]{36}$/i;

/** /caderno/exportar?formato=pdf|docx[&curso=<id>|&aula=<id>] — só as anotações (nunca o vídeo). */
export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.redirect(new URL("/entrar", request.nextUrl.origin));

  const params = request.nextUrl.searchParams;
  const format = params.get("formato") === "docx" ? "docx" : "pdf";
  const courseId = params.get("curso");
  const lessonId = params.get("aula");
  const filter = {
    courseId: courseId && UUID.test(courseId) ? courseId : undefined,
    lessonId: lessonId && UUID.test(lessonId) ? lessonId : undefined,
  };

  const courses = await getNotebook(profile.id, filter);
  const title = filter.lessonId
    ? `Anotações · ${courses[0]?.lessons[0]?.title ?? "Aula"}`
    : filter.courseId
      ? `Anotações · ${courses[0]?.title ?? "Curso"}`
      : "Meu Caderno";
  const filename = `${slugify(title) || "caderno"}.${format}`;

  if (format === "docx") {
    const buffer = await notebookToDocx(courses, title);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }
  const bytes = await notebookToPdf(courses, title);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
