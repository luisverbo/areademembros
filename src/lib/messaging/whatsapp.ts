import "server-only";

// WhatsApp: API oficial (WhatsApp Cloud API, da Meta) ou Z-API, escolhido por WHATSAPP_PROVIDER.
// Sem as variáveis do provedor escolhido, nada é enviado.
// WHATSAPP_GRAPH_URL / ZAPI_API_URL só existem para os testes (servidor falso).

export type WhatsappProvider = "meta" | "zapi";
export type SendResult = { ok: true; id?: string } | { ok: false; error: string };

export function whatsappProvider(): WhatsappProvider | null {
  const provider = (process.env.WHATSAPP_PROVIDER ?? "meta").trim().toLowerCase();
  if (provider === "zapi") {
    return process.env.ZAPI_INSTANCE_ID && process.env.ZAPI_TOKEN ? "zapi" : null;
  }
  return process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_TOKEN ? "meta" : null;
}

export const whatsappProviderLabels: Record<WhatsappProvider, string> = { meta: "API oficial (Meta)", zapi: "Z-API" };

/** Só dígitos, com DDI (formato que as duas APIs esperam). */
export function whatsappDigits(e164: string): string {
  return e164.replace(/\D/g, "");
}

/** Parâmetros de modelo da Meta não aceitam quebra de linha, tab nem mais de 4 espaços seguidos. */
export function templateParam(text: string): string {
  return text
    .replace(/\s*\n+\s*/g, " · ")
    .replace(/\t/g, " ")
    .replace(/ {4,}/g, "   ")
    .trim()
    .slice(0, 1000);
}

export async function sendWhatsapp(to: string, text: string, opts: { name?: string } = {}): Promise<SendResult> {
  const provider = whatsappProvider();
  if (!provider) return { ok: false, error: "whatsapp_not_configured" };
  const phone = whatsappDigits(to);
  try {
    return provider === "zapi" ? await sendZapi(phone, text) : await sendMeta(phone, text, opts.name);
  } catch (error) {
    console.error("whatsapp", error instanceof Error ? error.message : "erro");
    return { ok: false, error: "whatsapp_unreachable" };
  }
}

// Fora da janela de 24 h (quando o aluno não falou com você antes), a Meta só entrega
// mensagens de modelo aprovado. WHATSAPP_TEMPLATE é um modelo com duas variáveis no corpo:
// {{1}} = primeiro nome e {{2}} = o texto da mensagem. Sem modelo, envia texto livre.
async function sendMeta(phone: string, text: string, name?: string): Promise<SendResult> {
  const version = process.env.WHATSAPP_API_VERSION || "v23.0";
  const template = process.env.WHATSAPP_TEMPLATE?.trim();
  const payload = template
    ? {
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
          name: template,
          language: { code: process.env.WHATSAPP_TEMPLATE_LANG || "pt_BR" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: templateParam(name || "tudo bem") },
                { type: "text", text: templateParam(text) },
              ],
            },
          ],
        },
      }
    : { messaging_product: "whatsapp", to: phone, type: "text", text: { body: text.slice(0, 4096), preview_url: true } };

  const res = await fetch(
    `${process.env.WHATSAPP_GRAPH_URL || "https://graph.facebook.com"}/${version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    },
  );
  const body = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { code?: number; message?: string } };
  if (!res.ok) return { ok: false, error: `meta_${body.error?.code ?? res.status}: ${(body.error?.message ?? "").slice(0, 200)}` };
  return { ok: true, id: body.messages?.[0]?.id };
}

async function sendZapi(phone: string, text: string): Promise<SendResult> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.ZAPI_CLIENT_TOKEN) headers["Client-Token"] = process.env.ZAPI_CLIENT_TOKEN;
  const res = await fetch(
    `${process.env.ZAPI_API_URL || "https://api.z-api.io"}/instances/${encodeURIComponent(process.env.ZAPI_INSTANCE_ID!)}/token/${encodeURIComponent(process.env.ZAPI_TOKEN!)}/send-text`,
    { method: "POST", headers, body: JSON.stringify({ phone, message: text }), signal: AbortSignal.timeout(15_000) },
  );
  const body = (await res.json().catch(() => ({}))) as { messageId?: string; zaapId?: string; error?: string; message?: string };
  if (!res.ok || body.error) return { ok: false, error: `zapi_${res.status}: ${String(body.error ?? body.message ?? "").slice(0, 200)}` };
  return { ok: true, id: body.messageId ?? body.zaapId };
}
