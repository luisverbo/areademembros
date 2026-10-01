import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Minha senha" };

export default async function AccountPasswordPage() {
  const profile = await requireUser();
  return (
    <main className="flex justify-center px-4 py-12">
      <div className="border-border bg-surface w-full max-w-sm rounded-[var(--radius-card)] border p-6">
        <h1 className="text-xl font-semibold">Criar ou trocar a senha</h1>
        <p className="text-fg-muted mt-1 mb-6 text-sm">Conta: {profile.email}</p>
        <PasswordForm />
      </div>
    </main>
  );
}
