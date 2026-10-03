import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { env } from "@/lib/env";
import { safeNextPath } from "@/lib/safe-redirect";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

const errors: Record<string, string> = {
  link: "Esse link expirou ou já foi usado. Peça um novo abaixo.",
};

export default async function LoginPage({ searchParams }: PageProps<"/entrar">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? safeNextPath(params.next) : undefined;
  const error = typeof params.erro === "string" ? errors[params.erro] : undefined;

  if (await getCurrentProfile()) redirect(next ?? "/");

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <p className="font-display mb-8 text-center text-2xl font-bold">
          {env.appName.split(".")[0]}
          <span className="text-accent-soft">.</span>
          {env.appName.split(".").slice(1).join(".")}
        </p>
        <div className="border-border bg-surface rounded-[var(--radius-card)] border p-6">
          <h1 className="text-xl font-semibold">Entrar</h1>
          <p className="text-fg-muted mt-1 mb-6 text-sm">Use seu e-mail e senha, ou receba um link de acesso.</p>
          {error ? (
            <p role="alert" className="border-accent/40 bg-accent/10 mb-4 rounded-lg border px-3 py-2 text-sm">
              {error}
            </p>
          ) : null}
          <LoginForm next={next} />
        </div>
      </div>
    </main>
  );
}
