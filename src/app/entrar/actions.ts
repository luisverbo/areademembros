"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { env } from "@/lib/env";
import { safeNextPath } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/components/ui/form-message";

const schema = z.object({
  email: z.email("Informe um e-mail válido.").trim().toLowerCase(),
  next: z.string().optional(),
});

export async function sendMagicLink(_prev: FormState | undefined, formData: FormData): Promise<FormState> {
  const parsed = schema.safeParse({ email: formData.get("email"), next: formData.get("next") ?? undefined });
  if (!parsed.success) {
    return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };
  }

  const next = safeNextPath(parsed.data.next);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      // Só quem já é aluno/lead entra por aqui. Novas contas nascem na compra ou no cadastro do curso grátis.
      shouldCreateUser: false,
      emailRedirectTo: `${env.siteUrl}/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  });

  // Mesma resposta exista ou não a conta (não revela quem é aluno), mas o motivo fica no log do servidor.
  if (error) {
    console.warn("signInWithOtp", { status: error.status, code: error.code, message: error.message });
  }
  if (error && error.status !== 422 && error.code !== "otp_disabled" && error.code !== "signup_disabled") {
    if (error.status === 429) {
      return { ok: false, message: "Muitas tentativas. Aguarde um minuto e tente de novo." };
    }
    console.error("signInWithOtp", error);
    return { ok: false, message: "Não foi possível enviar o link agora. Tente novamente em instantes." };
  }

  return {
    ok: true,
    message: `Se ${parsed.data.email} tiver acesso, você vai receber um link para entrar. Confira também o spam.`,
  };
}

const passwordSchema = z.object({
  email: z.email("Informe um e-mail válido.").trim().toLowerCase(),
  password: z.string().min(1, "Informe a senha."),
  next: z.string().optional(),
});

export async function signInWithPassword(_prev: FormState | undefined, formData: FormData): Promise<FormState> {
  const parsed = passwordSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  if (error) {
    if (error.status === 429) return { ok: false, message: "Muitas tentativas. Aguarde um minuto e tente de novo." };
    console.warn("signInWithPassword", { status: error.status, code: error.code });
    return {
      ok: false,
      message: "E-mail ou senha incorretos. Se ainda não criou sua senha, use “Primeiro acesso ou esqueci a senha”.",
    };
  }
  redirect(safeNextPath(parsed.data.next));
}

const resetSchema = z.object({ email: z.email("Informe um e-mail válido.").trim().toLowerCase() });

/** Primeiro acesso ou esqueci a senha: manda um link para criar/redefinir a senha. */
export async function requestPasswordReset(_prev: FormState | undefined, formData: FormData): Promise<FormState> {
  const parsed = resetSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${env.siteUrl}/auth/confirm?next=${encodeURIComponent("/conta/senha")}`,
  });
  if (error) {
    console.warn("resetPasswordForEmail", { status: error.status, code: error.code, message: error.message });
    if (error.status === 429) return { ok: false, message: "Muitas tentativas. Aguarde um minuto e tente de novo." };
  }
  // Mesma resposta exista ou não a conta.
  return {
    ok: true,
    message: `Se ${parsed.data.email} tiver acesso, você vai receber um link para criar sua senha. Confira também o spam.`,
  };
}
