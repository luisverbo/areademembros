import "server-only";
import { createAuthLink } from "@/lib/auth-links";
import { accessEmail, isEmailConfigured, sendEmail } from "@/lib/email";

export type AccessEmailResult = { ok: true } | { ok: false; reason: string };

/** E-mail "Seu acesso está liberado" com o link de criar a senha (vale 1 hora). */
export async function sendAccessEmail(email: string, opts: { name?: string | null; courseTitle: string }): Promise<AccessEmailResult> {
  if (!isEmailConfigured()) return { ok: false, reason: "o e-mail (Resend) não está configurado na Vercel (RESEND_API_KEY e EMAIL_FROM)" };
  const link = await createAuthLink(email, "password");
  if (!link) return { ok: false, reason: "não foi possível gerar o link de acesso (o usuário existe no Supabase?)" };
  const result = await sendEmail(accessEmail(email, link, opts));
  return result.ok ? { ok: true } : { ok: false, reason: `o Resend recusou: ${result.error ?? "erro desconhecido"}` };
}

/** Frase para o admin sobre o envio. */
export function accessEmailMessage(email: string, result: AccessEmailResult): string {
  return result.ok ? `E-mail de acesso enviado para ${email}.` : `O e-mail de acesso NÃO foi enviado: ${result.reason}.`;
}
