import type { Adapter } from "./types";
import { get, hmac, ids, safeEqual, str } from "./util";

// Kiwify: ?signature= (HMAC-SHA1 hex com o token do webhook). Corpo plano ou embrulhado em { order: {...} }.
// A documentação calcula sobre JSON.stringify do corpo; aceitamos também o corpo cru por segurança.
const APPROVED_TYPES = new Set(["order_approved"]);
const REFUND_TYPES = new Set(["order_refunded", "chargeback"]);
const REFUND_STATUS = new Set(["refunded", "chargedback"]);

export const kiwify: Adapter = {
  requiredEnv: ["KIWIFY_WEBHOOK_TOKEN"],

  verify({ rawBody, json, query }) {
    const token = process.env.KIWIFY_WEBHOOK_TOKEN!;
    const signature = query.get("signature") ?? str(json.signature);
    if (!signature) return false;
    const candidates = [rawBody, JSON.stringify(json)];
    if (json.order && typeof json.order === "object") candidates.push(JSON.stringify(json.order));
    return candidates.some((data) => safeEqual(hmac("sha1", token, data), signature));
  },

  async parse({ json }) {
    const o = (json.order && typeof json.order === "object" ? json.order : json) as Record<string, unknown>;
    const type = str(o.webhook_event_type) ?? "";
    const status = str(o.order_status) ?? "";
    const orderId = str(o.order_id);
    if (!orderId) return null;

    let kind: "approved" | "refunded" | "ignored" = "ignored";
    if (REFUND_TYPES.has(type) || REFUND_STATUS.has(status)) kind = "refunded";
    else if (APPROVED_TYPES.has(type) || (!type && status === "paid")) kind = "approved";

    return {
      provider: "kiwify",
      idempotencyKey: `${orderId}:${type || status}`,
      kind,
      eventType: type || status,
      transactionId: orderId,
      productIds: ids(get(o, "Product", "product_id")),
      buyer: {
        email: str(get(o, "Customer", "email"))?.toLowerCase() ?? null,
        name: str(get(o, "Customer", "full_name")) ?? str(get(o, "Customer", "first_name")),
        phone: str(get(o, "Customer", "mobile")),
      },
    };
  },
};
