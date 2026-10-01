"use server";

import { z } from "zod";
import type { FormState } from "@/components/ui/form-message";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const schema = z
  .object({
    password: z.string().min(8, "Use pelo menos 8 caracteres.").max(72, "Use no máximo 72 caracteres."),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "As senhas não conferem." });

export async function updatePassword(_prev: FormState | undefined, formData: FormData): Promise<FormState> {
  await requireUser();
  const parsed = schema.safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") return { ok: false, errors: { password: ["Escolha uma senha diferente da atual."] } };
    if (error.code === "weak_password") return { ok: false, errors: { password: ["Senha fraca. Misture letras e números."] } };
    console.warn("updateUser password", { status: error.status, code: error.code });
    return { ok: false, message: "Não foi possível salvar a senha. Tente de novo." };
  }
  return { ok: true, message: "Senha salva. Nas próximas vezes, entre com seu e-mail e esta senha." };
}
