import type { Metadata } from "next";
import { Brand } from "@/components/brand";
import { formatLongDate } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Verificar certificado", robots: { index: false } };

export default async function VerifyCertificatePage({ params }: PageProps<"/certificado/[code]">) {
  const { code } = await params;
  const clean = code.trim().toUpperCase();
  const supabase = await createClient();
  const { data } = /^[0-9A-F]{12}$/.test(clean)
    ? await supabase.rpc("verify_certificate", { p_code: clean }).maybeSingle()
    : { data: null };

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="border-border bg-surface w-full max-w-md rounded-[var(--radius-card)] border p-8">
        <Brand />
        {data ? (
          <>
            <p className="bg-accent/15 text-accent-soft mt-6 inline-flex rounded-md px-2 py-1 text-xs font-bold tracking-wide uppercase">
              Certificado válido
            </p>
            <h1 className="mt-3 text-2xl font-bold">{data.student_name}</h1>
            <p className="text-fg-soft mt-2">
              concluiu <b className="text-fg">{data.course_title}</b>
              {data.hours ? `, com carga horária de ${data.hours} hora${data.hours === 1 ? "" : "s"}` : ""}, em{" "}
              {formatLongDate(data.issued_at)}.
            </p>
            <p className="text-fg-muted mt-6 text-xs">Código {clean}</p>
          </>
        ) : (
          <>
            <h1 className="mt-6 text-2xl font-bold">Certificado não encontrado</h1>
            <p className="text-fg-soft mt-2">Confira o código impresso no certificado ({clean || "vazio"}).</p>
          </>
        )}
      </div>
    </main>
  );
}
