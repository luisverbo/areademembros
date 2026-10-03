import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getCourseBySlug } from "@/lib/catalog";
import { certificateToPdf } from "@/lib/certificate-pdf";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

// Emite (na primeira vez) e baixa o certificado do curso concluído.
export async function GET(request: Request, { params }: RouteContext<"/curso/[slug]/certificado">) {
  await requireUser();
  const { slug } = await params;
  const course = await getCourseBySlug(slug);
  if (!course) return new Response("Curso não encontrado", { status: 404 });

  const supabase = await createClient();
  const { data: cert, error } = await supabase.rpc("issue_certificate", { p_course_id: course.id });
  if (error || !cert) {
    if (error?.message.includes("nome ausente")) {
      return NextResponse.redirect(new URL(`/conta?certificado=${encodeURIComponent(slug)}`, request.url), 303);
    }
    return NextResponse.redirect(new URL(`/curso/${slug}`, request.url), 303);
  }

  const pdf = await certificateToPdf({
    studentName: cert.student_name,
    courseTitle: cert.course_title,
    hours: cert.hours,
    issuedAt: cert.issued_at,
    code: cert.code,
    appName: env.appName,
    verifyUrl: `${env.siteUrl}/certificado/${cert.code}`,
  });
  const filename = `certificado-${slug}.pdf`;
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
