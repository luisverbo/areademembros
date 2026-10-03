import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

type NewUser = { email: string; fullName?: string | null; whatsapp?: string | null; marketingConsent?: boolean };

/**
 * Devolve o id do usuário com esse e-mail, criando a conta se não existir
 * (já confirmada: o acesso é sempre pelo link mágico). Usado pelo admin e pelos webhooks.
 * Só chamar depois de verificar a permissão de quem pediu.
 */
export async function findOrCreateUser({ email, fullName, whatsapp, marketingConsent }: NewUser): Promise<string> {
  const admin = createAdminClient();
  // O Auth do Supabase grava o e-mail em minúsculas; o perfil copia de lá.
  const normalized = email.trim().toLowerCase();

  const { data: existing } = await admin.from("profiles").select("id").eq("email", normalized).maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await admin.auth.admin.createUser({
    email: normalized,
    email_confirm: true,
    user_metadata: { full_name: fullName ?? undefined, whatsapp: whatsapp ?? undefined, marketing_consent: marketingConsent ?? false },
  });
  if (error || !data.user) {
    // Corrida: outra requisição criou o mesmo e-mail entre a busca e a criação.
    const { data: retry } = await admin.from("profiles").select("id").eq("email", normalized).maybeSingle();
    if (retry) return retry.id;
    throw new Error(`Não foi possível criar o usuário: ${error?.message ?? "desconhecido"}`);
  }
  return data.user.id;
}

/**
 * Primeiro acesso pago (compra ou matrícula manual) de uma conta: derruba as sessões abertas.
 * Uma conta pode ter nascido num cadastro de curso grátis feito por terceiros; o aluno de verdade
 * entra pelo e-mail de acesso. Chamar depois de matricular.
 */
export async function revokeSessionsOnFirstPaidAccess(userId: string): Promise<void> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("enrollments")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("origin", ["purchase", "manual"]);
  if ((count ?? 0) <= 1) {
    const { error } = await admin.rpc("revoke_user_sessions", { p_user_id: userId });
    if (error) console.error("revoke_user_sessions", error.message);
  }
}
