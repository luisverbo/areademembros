import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Criar ou redefinir senha" };

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <div className="text-center text-2xl">
          <Brand href="/entrar" />
        </div>
        <div className="border-border bg-surface rounded-[var(--radius-card)] border p-6">
          <h1 className="text-xl font-semibold">Primeiro acesso ou esqueci a senha</h1>
          <p className="text-fg-muted mt-1 mb-6 text-sm">Digite o e-mail da sua compra. Enviamos um link para você criar uma senha nova.</p>
          <ResetForm />
        </div>
        <Link href="/entrar" className="text-fg-muted hover:text-fg text-center text-sm">
          ← Voltar para entrar
        </Link>
      </div>
    </main>
  );
}
