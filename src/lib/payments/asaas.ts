import type { Adapter } from "./types";
import { get, ids, safeEqual, str } from "./util";

// Asaas: cabeçalho asaas-access-token igual ao token configurado no webhook.
// O aviso não traz o e-mail: buscamos o cliente em /v3/customers/{id} com a chave da API.
// Produto = ID do link de pagamento, externalReference ou ID da assinatura.
const APPROVED = new Set(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]);
const REFUNDED = new Set([
  "PAYMENT_REFUNDED",
  "PAYMENT_CHARGEBACK_REQUESTED",
  "PAYMENT_CHARGEBACK_DISPUTE",
  "PAYMENT_AWAITING_CHARGEBACK_REVERSAL",
]);

const apiUrl = () => (process.env.ASAAS_API_URL ?? "https://api.asaas.com/v3").replace(/\/$/, "");

export const asaas: Adapter = {
  requiredEnv: ["ASAAS_WEBHOOK_TOKEN", "ASAAS_API_KEY"],

  verify({ headers }) {
    return safeEqual(headers.get("asaas-access-token"), process.env.ASAAS_WEBHOOK_TOKEN);
  },

  async parse({ json }) {
    const event = str(json.event) ?? "";
    const paymentId = str(get(json, "payment", "id"));
    if (!paymentId || !event.startsWith("PAYMENT_")) return null;
    const kind = APPROVED.has(event) ? "approved" : REFUNDED.has(event) ? "refunded" : "ignored";

    let buyer = { email: null as string | null, name: null as string | null, phone: null as string | null };
    const customerId = str(get(json, "payment", "customer"));
    if (kind === "approved" && customerId) {
      const res = await fetch(`${apiUrl()}/customers/${encodeURIComponent(customerId)}`, {
        headers: { access_token: process.env.ASAAS_API_KEY!, "User-Agent": "LC.Academy", "Content-Type": "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`asaas customers ${res.status}`);
      const c = (await res.json()) as Record<string, unknown>;
      buyer = { email: str(c.email)?.toLowerCase() ?? null, name: str(c.name), phone: str(c.mobilePhone) ?? str(c.phone) };
    }

    return {
      provider: "asaas",
      idempotencyKey: str(json.id) ?? `${paymentId}:${event}`,
      kind,
      eventType: event,
      transactionId: paymentId,
      productIds: ids(get(json, "payment", "paymentLink"), get(json, "payment", "externalReference"), get(json, "payment", "subscription")),
      buyer,
    };
  },
};
