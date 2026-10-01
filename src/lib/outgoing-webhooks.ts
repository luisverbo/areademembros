import "server-only";
import { createHmac, randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export type OutgoingEvent = "lead.created" | "purchase.approved" | "purchase.refunded";

export const OUTGOING_EVENTS: { id: OutgoingEvent; label: string }[] = [
  { id: "lead.created", label: "Novo lead (curso grátis)" },
  { id: "purchase.approved", label: "Compra aprovada" },
  { id: "purchase.refunded", label: "Reembolso ou chargeback" },
];

/** Assinatura enviada no cabeçalho X-LC-Signature: "sha256=<hex>" do corpo com o segredo do webhook. */
export function signPayload(secret: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

type Target = { id: string; url: string; secret: string };

export async function deliver(
  target: Target,
  event: OutgoingEvent | "test",
  data: unknown,
): Promise<{ status: number | null; error: string | null }> {
  const body = JSON.stringify({ id: randomUUID(), event, created_at: new Date().toISOString(), data });
  let status: number | null = null;
  let error: string | null = null;
  try {
    const res = await fetch(target.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "LC.Academy-Webhooks/1.0",
        "X-LC-Event": event,
        "X-LC-Signature": signPayload(target.secret, body),
      },
      body,
      signal: AbortSignal.timeout(8_000),
    });
    status = res.status;
    if (!res.ok) error = `HTTP ${res.status}`;
  } catch (e) {
    error = e instanceof Error ? e.message : "falha de rede";
  }

  const admin = createAdminClient();
  await admin.from("webhook_deliveries").insert({ webhook_id: target.id, event, payload: JSON.parse(body), status_code: status, error });
  return { status, error };
}

/** Envia o evento para todos os webhooks ativos inscritos nele. Nunca lança erro. */
export async function dispatchEvent(event: OutgoingEvent, data: unknown): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: hooks } = await admin
      .from("outgoing_webhooks")
      .select("id, url, secret")
      .eq("is_active", true)
      .contains("events", [event]);
    await Promise.all((hooks ?? []).map((hook) => deliver(hook, event, data)));
  } catch (e) {
    console.error("dispatchEvent", event, e);
  }
}
