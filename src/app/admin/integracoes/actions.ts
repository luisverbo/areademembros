"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/ui/form-message";
import { requireAdmin } from "@/lib/auth";
import { centralEmail, isEmailConfigured, sendEmail } from "@/lib/email";
import { isPrivateHost } from "@/lib/private-host";
import { dbErrorMessage, formFields, parseForm } from "@/lib/forms";
import { deliver, OUTGOING_EVENTS } from "@/lib/outgoing-webhooks";
import { createClient } from "@/lib/supabase/server";

const EVENT_IDS = OUTGOING_EVENTS.map((e) => e.id) as [string, ...string[]];

const schema = z.object({
  name: formFields.text("Dê um nome (ex.: FunilPro)."),
  url: formFields.optionalUrl().refine((v) => v !== null, "Informe a URL que vai receber os avisos."),
});

export async function createOutgoingWebhook(_prev: FormState | undefined, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = parseForm(schema, formData);
  if (!parsed.success) return parsed.state;
  const events = formData
    .getAll("events")
    .map(String)
    .filter((e) => EVENT_IDS.includes(e));
  if (!events.length) return { ok: false, errors: { events: ["Escolha pelo menos um evento."] } };

  const target = new URL(parsed.data.url!);
  if (target.protocol !== "https:") return { ok: false, errors: { url: ["Use um endereço https://."] } };
  if (isPrivateHost(target.hostname))
    return { ok: false, errors: { url: ["Esse endereço é interno; use o endereço público do seu funil."] } };

  const supabase = await createClient();
  const { error } = await supabase.from("outgoing_webhooks").insert({ name: parsed.data.name, url: target.toString(), events });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/admin/integracoes", "layout");
  return { ok: true, message: "Webhook criado. Copie o segredo para validar a assinatura no destino." };
}

export async function toggleOutgoingWebhook(id: string, active: boolean) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("outgoing_webhooks").update({ is_active: active }).eq("id", id);
  revalidatePath("/admin/integracoes", "layout");
}

export async function deleteOutgoingWebhook(id: string) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("outgoing_webhooks").delete().eq("id", id);
  revalidatePath("/admin/integracoes", "layout");
}

export async function testOutgoingWebhook(id: string): Promise<FormState> {
  await requireAdmin();
  const supabase = await createClient();
  const { data: hook } = await supabase.from("outgoing_webhooks").select("id, url, secret").eq("id", id).single();
  if (!hook) return { ok: false, message: "Webhook não encontrado." };
  const result = await deliver(hook, "test", { message: "Teste enviado pelo admin da LC.Academy" });
  revalidatePath("/admin/integracoes", "layout");
  return result.error
    ? { ok: false, message: `O destino não aceitou: ${result.error}.` }
    : { ok: true, message: `Teste entregue (HTTP ${result.status}).` };
}

/** Manda um e-mail de teste para o próprio admin e devolve a resposta do Resend. */
export async function sendTestEmail(): Promise<FormState> {
  const me = await requireAdmin();
  if (!isEmailConfigured()) {
    return { ok: false, message: "Falta configurar na Vercel: RESEND_API_KEY e EMAIL_FROM (depois, Redeploy)." };
  }
  const result = await sendEmail(
    centralEmail(me.email, {
      subject: "Teste de e-mail da área de membros",
      body: "Se você recebeu este e-mail, o envio pelo Resend está funcionando.\n\nConfira se ele chegou na caixa de entrada (e não no spam).",
      unsubscribeUrl: null,
    }),
  );
  return result.ok
    ? { ok: true, message: `Enviado para ${me.email}. Confira a caixa de entrada e o spam.` }
    : { ok: false, message: `O Resend recusou: ${result.error}` };
}
