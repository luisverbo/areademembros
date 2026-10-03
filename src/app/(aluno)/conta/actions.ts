"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/ui/form-message";
import { requireUser } from "@/lib/auth";
import { normalizeWhatsapp } from "@/lib/phone";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  fullName: z.string().trim().min(3, "Escreva seu nome completo (sai no certificado).").max(120),
  whatsapp: z.string().trim().max(30),
});

export async function updateMyData(_prev: FormState | undefined, formData: FormData): Promise<FormState> {
  const profile = await requireUser();
  const parsed = schema.safeParse({ fullName: formData.get("fullName"), whatsapp: formData.get("whatsapp") ?? "" });
  if (!parsed.success) return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };
  const whatsapp = parsed.data.whatsapp ? normalizeWhatsapp(parsed.data.whatsapp) : null;
  if (parsed.data.whatsapp && !whatsapp) return { ok: false, errors: { whatsapp: ["WhatsApp inválido. Use DDD + número."] } };

  const consent = formData.get("consent") === "on";
  const receive = formData.get("receive") === "on";
  const now = new Date().toISOString();
  // Aceite e descadastro não são editáveis pela API do aluno: grava pelo servidor, só no próprio perfil.
  const { error } = await createAdminClient()
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      whatsapp,
      marketing_consent: receive && consent,
      marketing_consent_at: receive && consent ? (profile.marketing_consent ? profile.marketing_consent_at : now) : null,
      messages_opt_out_at: receive ? null : (profile.messages_opt_out_at ?? now),
    })
    .eq("id", profile.id);
  if (error) return { ok: false, message: "Não foi possível salvar. Tente de novo." };
  revalidatePath("/", "layout");
  return { ok: true, message: "Dados salvos." };
}
