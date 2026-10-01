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
