import type { Metadata } from "next";
import { z } from "zod";
import { Brand } from "@/components/brand";
import { createAdminClient } from "@/lib/supabase/admin";
import { UnsubscribeForm } from "./route-form";

export const metadata: Metadata = { title: "Descadastro", robots: { index: false } };

export default async function UnsubscribePage({ params }: PageProps<"/descadastro/[token]">) {
  const { token } = await params;
  const valid = z.uuid().safeParse(token).success;
  const { data: profile } = valid
    ? await createAdminClient().from("profiles").select("email, messages_opt_out_at").eq("unsubscribe_token", token).maybeSingle()
    : { data: null };

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="border-border bg-surface w-full max-w-md rounded-[var(--radius-card)] border p-8">
        <Brand />
        <h1 className="mt-6 text-2xl font-bold">Mensagens</h1>
        {profile ? (
          <>
            <p className="text-fg-muted mt-1 mb-5 text-sm">{profile.email}</p>
            <UnsubscribeForm token={token} initiallyOut={Boolean(profile.messages_opt_out_at)} />
          </>
        ) : (
          <p className="text-fg-soft mt-3">Link inválido ou expirado.</p>
        )}
      </div>
    </main>
  );
}
