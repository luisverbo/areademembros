import "server-only";
import { centralEmail, isEmailConfigured, sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/database.types";
import { firstName } from "./render";
import { sendWhatsapp, whatsappProvider } from "./whatsapp";

export type Channel = Database["public"]["Enums"]["message_channel"];
export type NewDelivery = Database["public"]["Tables"]["message_deliveries"]["Insert"];

const MAX_ATTEMPTS = 3;
const LEASE_MS = 5 * 60_000;
const leaseFilter = () => `claimed_at.is.null,claimed_at.lt.${new Date(Date.now() - LEASE_MS).toISOString()}`;

export function channelReady(channel: Channel): boolean {
  return channel === "email" ? isEmailConfigured() : Boolean(whatsappProvider());
}

export function unsubscribeUrl(token: string): string {
  return `${env.siteUrl}/descadastro/${token}`;
}

/** Coloca na fila. Repetidos (mesmo dedupe_key) são ignorados. Retorna quantos entraram. */
export async function enqueue(rows: NewDelivery[]): Promise<number> {
  if (!rows.length) return 0;
  const admin = createAdminClient();
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const { data, error } = await admin
      .from("message_deliveries")
      .upsert(rows.slice(i, i + 500), { onConflict: "dedupe_key", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(`enqueue: ${error.message}`);
    inserted += data?.length ?? 0;
  }
  return inserted;
}

type Pending = {
  id: string;
  campaign_id: string | null;
  channel: Channel;
  to_address: string;
  subject: string | null;
  body: string;
  attempts: number;
  user: { full_name: string | null; unsubscribe_token: string; messages_opt_out_at: string | null } | null;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Envia o que está na fila (de uma campanha ou de tudo), até o limite de tempo.
 * Pode rodar em paralelo com outra execução: cada envio é "reservado" antes de sair.
 */
export async function processPending(opts: { campaignId?: string; budgetMs?: number; limit?: number } = {}) {
  const admin = createAdminClient();
  const deadline = Date.now() + (opts.budgetMs ?? 50_000);
  const stats = { sent: 0, failed: 0, skipped: 0, remaining: 0 };
  const touched = new Set<string>();

  while (Date.now() < deadline) {
    let query = admin
      .from("message_deliveries")
      .select(
        "id, campaign_id, channel, to_address, subject, body, attempts, user:profiles(full_name, unsubscribe_token, messages_opt_out_at)",
      )
      .eq("status", "pending")
      .lt("attempts", MAX_ATTEMPTS)
      .or(leaseFilter())
      .order("created_at")
      .limit(Math.min(opts.limit ?? 50, 50));
    if (opts.campaignId) query = query.eq("campaign_id", opts.campaignId);
    const { data } = await query.overrideTypes<Pending[], { merge: false }>();
    if (!data?.length) break;

    for (const d of data) {
      if (Date.now() >= deadline) break;
      // Reserva: só um processo envia cada mensagem.
      const { data: claimed } = await admin
        .from("message_deliveries")
        .update({ attempts: d.attempts + 1, claimed_at: new Date().toISOString() })
        .eq("id", d.id)
        .eq("status", "pending")
        .eq("attempts", d.attempts)
        .or(leaseFilter())
        .select("id");
      if (!claimed?.length) continue;
      if (d.campaign_id) touched.add(d.campaign_id);

      if (d.user?.messages_opt_out_at) {
        await admin.from("message_deliveries").update({ status: "skipped", error: "descadastrado" }).eq("id", d.id);
        stats.skipped++;
        continue;
      }
      if (!channelReady(d.channel)) {
        await admin
          .from("message_deliveries")
          .update({ status: "skipped", error: d.channel === "email" ? "e-mail não configurado" : "WhatsApp não configurado" })
          .eq("id", d.id);
        stats.skipped++;
        continue;
      }

      const result =
        d.channel === "email"
          ? await sendEmail(
              centralEmail(d.to_address, {
                subject: d.subject || env.appName,
                body: d.body,
                unsubscribeUrl: d.user ? unsubscribeUrl(d.user.unsubscribe_token) : null,
              }),
            )
          : await sendWhatsapp(d.to_address, d.body, { name: firstName(d.user?.full_name) });

      if (result.ok) {
        await admin
          .from("message_deliveries")
          .update({ status: "sent", sent_at: new Date().toISOString(), provider_message_id: result.id ?? null, error: null })
          .eq("id", d.id);
        stats.sent++;
      } else {
        const final = d.attempts + 1 >= MAX_ATTEMPTS;
        await admin
          .from("message_deliveries")
          .update({ status: final ? "failed" : "pending", error: result.error ?? "erro" }) // tenta de novo depois que a reserva expira
          .eq("id", d.id);
        if (final) stats.failed++;
      }
      // Ritmo: o WhatsApp bloqueia números que disparam rápido demais.
      if (d.channel === "whatsapp") await sleep(whatsappProvider() === "zapi" ? 1500 : 250);
    }
  }

  let remainingQuery = admin
    .from("message_deliveries")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .lt("attempts", MAX_ATTEMPTS);
  if (opts.campaignId) remainingQuery = remainingQuery.eq("campaign_id", opts.campaignId);
  stats.remaining = (await remainingQuery).count ?? 0;

  for (const campaignId of touched) await finishCampaignIfDone(campaignId);
  return stats;
}

export async function finishCampaignIfDone(campaignId: string) {
  const admin = createAdminClient();
  const { count } = await admin
    .from("message_deliveries")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("status", "pending")
    .lt("attempts", MAX_ATTEMPTS);
  if (!count) {
    // Quem esgotou as tentativas sem resposta vira falha.
    await admin
      .from("message_deliveries")
      .update({ status: "failed", error: "sem resposta do provedor" })
      .eq("campaign_id", campaignId)
      .eq("status", "pending");
    await admin
      .from("message_campaigns")
      .update({ status: "sent", finished_at: new Date().toISOString() })
      .eq("id", campaignId)
      .eq("status", "sending");
  }
}
