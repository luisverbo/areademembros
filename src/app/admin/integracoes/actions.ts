"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/ui/form-message";
import { requireAdmin } from "@/lib/auth";
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

  const supabase = await createClient();
  const { error } = await supabase.from("outgoing_webhooks").insert({ name: parsed.data.name, url: parsed.data.url!, events });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/admin/integracoes");
  return { ok: true, message: "Webhook criado. Copie o segredo para validar a assinatura no destino." };
}

export async function toggleOutgoingWebhook(id: string, active: boolean) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("outgoing_webhooks").update({ is_active: active }).eq("id", id);
  revalidatePath("/admin/integracoes");
}

export async function deleteOutgoingWebhook(id: string) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("outgoing_webhooks").delete().eq("id", id);
  revalidatePath("/admin/integracoes");
}

export async function testOutgoingWebhook(id: string): Promise<FormState> {
  await requireAdmin();
  const supabase = await createClient();
  const { data: hook } = await supabase.from("outgoing_webhooks").select("id, url, secret").eq("id", id).single();
  if (!hook) return { ok: false, message: "Webhook não encontrado." };
  const result = await deliver(hook, "test", { message: "Teste enviado pelo admin da LC.Academy" });
  revalidatePath("/admin/integracoes");
  return result.error
    ? { ok: false, message: `O destino não aceitou: ${result.error}.` }
    : { ok: true, message: `Teste entregue (HTTP ${result.status}).` };
}
