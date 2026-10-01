"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import type { FormState } from "@/components/ui/form-message";
import { requireAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { audienceSchema, resolveAudience } from "@/lib/messaging/audience";
import { AUTOMATIONS, runDailyAutomations } from "@/lib/messaging/automations";
import { channelReady, enqueue, processPending, type Channel } from "@/lib/messaging/deliver";
import { firstName, renderTemplate } from "@/lib/messaging/render";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const channelSchema = z.enum(["email", "whatsapp"]);
const empty = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() ? v.trim() : null);

function readAudience(formData: FormData) {
  return audienceSchema.safeParse({
    segment: formData.get("segment"),
    courseId: empty(formData.get("courseId")),
    cohortId: empty(formData.get("cohortId")),
    idleDays: formData.get("idleDays") || 7,
  });
}

const messageSchema = z
  .object({
    name: z.string().trim().min(1, "Dê um nome para encontrar depois.").max(200),
    channel: channelSchema,
    purpose: z.enum(["notice", "promo"]),
    subject: z.string().trim().max(200).nullable(),
    body: z.string().trim().min(1, "Escreva a mensagem.").max(4000, "Mensagem muito longa (máx. 4.000 caracteres)."),
    link: z.url("Link inválido.").nullable(),
  })
  .refine((m) => m.channel !== "email" || m.subject, { message: "Escreva o assunto do e-mail.", path: ["subject"] });

function readMessage(formData: FormData) {
  return messageSchema.safeParse({
    name: formData.get("name"),
    channel: formData.get("channel"),
    purpose: formData.get("purpose"),
    subject: empty(formData.get("subject")),
    body: formData.get("body"),
    link: empty(formData.get("link")),
  });
}

export type AudiencePreview = {
  total: number;
  excluded: { optOut: number; noConsent: number; noAddress: number };
  sample: string[];
  ready: boolean;
};

export async function previewAudience(formData: FormData): Promise<AudiencePreview | { error: string }> {
  await requireAdmin();
  const audience = readAudience(formData);
  const channel = channelSchema.safeParse(formData.get("channel"));
  const purpose = formData.get("purpose") === "promo" ? "promo" : "notice";
  if (!audience.success || !channel.success) return { error: "Escolha o público e o canal." };
  const result = await resolveAudience(audience.data, channel.data, purpose);
  return {
    total: result.recipients.length,
    excluded: result.excluded,
    sample: result.recipients.slice(0, 5).map((r) => r.name || r.address),
    ready: channelReady(channel.data),
  };
}

const varsFor = (name: string | null, courseTitle: string | null, link: string | null) => ({
  nome: firstName(name),
  curso: courseTitle ?? env.appName,
  link: link ?? env.siteUrl,
});

/** Manda a mensagem só para o próprio admin, para conferir como chega. */
export async function sendTest(formData: FormData): Promise<FormState> {
  const profile = await requireAdmin();
  const message = readMessage(formData);
  if (!message.success) return { ok: false, message: message.error.issues[0].message };
  const { channel, subject, body, link } = message.data;
  if (!channelReady(channel))
    return {
      ok: false,
      message: channel === "email" ? "O e-mail (Resend) ainda não está configurado." : "O WhatsApp ainda não está configurado.",
    };
  const to = channel === "email" ? profile.email : profile.whatsapp;
  if (!to) return { ok: false, message: "Cadastre o seu WhatsApp na sua ficha de aluno para receber o teste." };

  const vars = varsFor(profile.full_name, null, link);
  const [row] = await createAdminClient()
    .from("message_deliveries")
    .insert({
      user_id: profile.id,
      channel,
      to_address: to,
      subject: subject ? `[Teste] ${renderTemplate(subject, vars)}` : null,
      body: renderTemplate(body, vars),
    })
    .select("id")
    .then((r) => r.data ?? []);
  await processPending({ budgetMs: 20_000, limit: 5 });
  const { data } = await createAdminClient().from("message_deliveries").select("status, error").eq("id", row.id).single();
  return data?.status === "sent"
    ? { ok: true, message: `Teste enviado para ${to}.` }
    : { ok: false, message: `Não foi possível enviar o teste: ${data?.error ?? "erro"}` };
}

export async function createCampaign(_prev: FormState | undefined, formData: FormData): Promise<FormState> {
  const profile = await requireAdmin();
  const message = readMessage(formData);
  const audience = readAudience(formData);
  if (!message.success) {
    const errors: Record<string, string[]> = {};
    for (const issue of message.error.issues) errors[String(issue.path[0])] ??= [issue.message];
    return { ok: false, errors };
  }
  if (!audience.success) return { ok: false, message: "Escolha o público." };
  const { name, channel, purpose, subject, body, link } = message.data;
  if (!channelReady(channel)) return { ok: false, message: "Este canal ainda não está configurado (veja Integrações)." };

  const { recipients } = await resolveAudience(audience.data, channel, purpose);
  if (!recipients.length) return { ok: false, message: "Ninguém neste público pode receber esta mensagem." };

  const admin = createAdminClient();
  const { data: campaign, error } = await admin
    .from("message_campaigns")
    .insert({ name, channel, purpose, audience: { ...audience.data, link }, subject, body, created_by: profile.id })
    .select("id")
    .single();
  if (error || !campaign) return { ok: false, message: "Não foi possível criar o envio." };

  await enqueue(
    recipients.map((r) => {
      const vars = varsFor(r.name, r.courseTitle, link);
      return {
        campaign_id: campaign.id,
        user_id: r.userId,
        channel: channel as Channel,
        to_address: r.address,
        subject: subject ? renderTemplate(subject, vars) : null,
        body: renderTemplate(body, vars),
        dedupe_key: `campaign:${campaign.id}:${r.userId}`,
      };
    }),
  );
  after(() => processPending({ campaignId: campaign.id, budgetMs: 240_000 }));
  revalidatePath("/admin/mensagens");
  redirect(`/admin/mensagens/${campaign.id}`);
}

export async function continueCampaign(campaignId: string) {
  await requireAdmin();
  await processPending({ campaignId, budgetMs: 50_000 });
  revalidatePath(`/admin/mensagens/${campaignId}`);
}

// ---------------------------------------------------------------------------
// Automações
// ---------------------------------------------------------------------------

const automationSchema = z.object({
  key: z.enum(Object.keys(AUTOMATIONS) as [string, ...string[]]),
  enabled: z.boolean(),
  channels: z.array(channelSchema).min(1, "Escolha pelo menos um canal."),
  subject: z.string().trim().max(200).nullable(),
  body: z.string().trim().max(4000),
  days: z.coerce.number().int().min(1, "Mínimo 1 dia.").max(365).optional(),
  link: z.union([z.url("Link inválido."), z.null()]).optional(),
  email: z.union([z.email("E-mail inválido."), z.null()]).optional(),
  whatsapp: z.string().trim().max(30).nullable().optional(),
});

export async function saveAutomation(_prev: FormState | undefined, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const key = String(formData.get("key"));
  const parsed = automationSchema.safeParse({
    key,
    enabled: formData.get("enabled") === "on",
    channels: formData.getAll("channels"),
    subject: empty(formData.get("subject")),
    body: String(formData.get("body") ?? ""),
    days: formData.has("days") ? formData.get("days") : undefined,
    link: formData.has("link") ? empty(formData.get("link")) : undefined,
    email: formData.has("email") ? empty(formData.get("email")) : undefined,
    whatsapp: formData.has("whatsapp") ? empty(formData.get("whatsapp")) : undefined,
  });
  if (!parsed.success) {
    const errors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= [issue.message];
    return { ok: false, errors };
  }
  const a = parsed.data;
  if (key !== "weekly_report" && !a.body) return { ok: false, errors: { body: ["Escreva a mensagem."] } };

  const supabase = await createClient();
  const { data: current } = await supabase.from("automations").select("settings").eq("key", key).single();
  const settings: Record<string, string | number> = { ...((current?.settings as Record<string, string | number>) ?? {}) };
  for (const field of ["days", "link", "email", "whatsapp"] as const) if (a[field] !== undefined) settings[field] = a[field] ?? "";

  const { error } = await supabase
    .from("automations")
    .update({ enabled: a.enabled, channels: a.channels, subject: a.subject, body: a.body, settings })
    .eq("key", key);
  if (error) return { ok: false, message: "Não foi possível salvar." };
  revalidatePath("/admin/mensagens/automacoes");
  return { ok: true, message: a.enabled ? "Salvo. Automação ligada." : "Salvo. Automação desligada." };
}

export async function runAutomationsNow(): Promise<FormState> {
  await requireAdmin();
  const { queued, delivery } = await runDailyAutomations(new Date(), 50_000);
  revalidatePath("/admin/mensagens/automacoes");
  const total = Object.values(queued)
    .filter((n) => n > 0)
    .reduce((a, b) => a + b, 0);
  return {
    ok: true,
    message: `Automações rodadas: ${total} mensage${total === 1 ? "m nova" : "ns novas"} na fila, ${delivery.sent} enviada${delivery.sent === 1 ? "" : "s"}${delivery.remaining ? `, ${delivery.remaining} aguardando` : ""}.`,
  };
}
