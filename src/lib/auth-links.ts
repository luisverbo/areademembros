import "server-only";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Link de acesso de uso único para um usuário que JÁ existe, apontando para /auth/confirm
 * com token_hash (funciona em qualquer aparelho, sem depender dos modelos de e-mail do Supabase).
 *  - "login": entra direto.
 *  - "password": entra e cai na tela de criar/trocar a senha.
 */
export async function createAuthLink(email: string, kind: "login" | "password", next = "/"): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: kind === "password" ? "recovery" : "magiclink", email });
  const hashed = data?.properties?.hashed_token;
  if (error || !hashed) {
    console.warn("generateLink", { kind, status: error?.status, code: error?.code });
    return null;
  }
  const params = new URLSearchParams({
    token_hash: hashed,
    type: kind === "password" ? "recovery" : "email",
    next: kind === "password" ? "/conta/senha" : next,
  });
  return `${env.siteUrl}/auth/confirm?${params}`;
}

export async function userExists(email: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("id").eq("email", email.trim().toLowerCase()).maybeSingle();
  return Boolean(data);
}
