import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { formatLongDate } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";
import { MyDataForm } from "./my-data-form";

export const metadata: Metadata = { title: "Minha conta" };

export default async function AccountPage({ searchParams }: PageProps<"/conta">) {
  const profile = await requireUser();
  const pendingCertificate = (await searchParams).certificado;
  const supabase = await createClient();
  const { data: certificates } = await supabase
    .from("certificates")
    .select("id, code, course_title, issued_at, course:courses(slug)")
    .eq("user_id", profile.id)
    .order("issued_at", { ascending: false });

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-bold">Minha conta</h1>
        <p className="text-fg-muted mt-1 text-sm">{profile.email}</p>
      </div>
      {typeof pendingCertificate === "string" ? (
        <p role="status" className="border-accent/40 bg-accent/10 rounded-lg border px-4 py-3 text-sm">
          Para emitir o certificado, salve seu nome completo abaixo e depois{" "}
          <a href={`/curso/${encodeURIComponent(pendingCertificate)}/certificado`} className="text-accent font-semibold hover:underline">
            baixe o certificado
          </a>
          .
        </p>
      ) : null}
      <section className="border-border bg-surface rounded-[var(--radius-card)] border p-6">
        <h2 className="mb-4 text-lg font-semibold">Seus dados</h2>
        <MyDataForm
          fullName={profile.full_name ?? ""}
          whatsapp={profile.whatsapp ?? ""}
          consent={profile.marketing_consent}
          receive={!profile.messages_opt_out_at}
        />
      </section>
      <section className="border-border bg-surface rounded-[var(--radius-card)] border p-6">
        <h2 className="mb-1 text-lg font-semibold">Certificados</h2>
        {certificates?.length ? (
          <ul className="divide-border mt-3 flex flex-col divide-y">
            {certificates.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{c.course_title}</p>
                  <p className="text-fg-muted text-xs">
                    Emitido em {formatLongDate(c.issued_at)} · código {c.code}
                  </p>
                </div>
                {c.course?.slug ? (
                  <a href={`/curso/${c.course.slug}/certificado`} className="text-accent text-sm font-semibold hover:underline">
                    Baixar PDF
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-fg-muted text-sm">Conclua todas as aulas de um curso com certificado para baixar o seu.</p>
        )}
      </section>
      <Link href="/conta/senha" className="text-fg-soft hover:text-fg text-sm font-semibold">
        Criar ou trocar a senha →
      </Link>
    </main>
  );
}
