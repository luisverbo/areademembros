import type { Adapter } from "./types";
import { get, hmac, ids, safeEqual, str } from "./util";

// Yampi: cabeçalho X-Yampi-Hmac-SHA256 = base64(HMAC-SHA256(corpo, segredo do webhook)).
// Produto: o admin pode cadastrar o ID do SKU ou o ID do produto.
const REFUND_ALIASES = new Set(["cancelled", "refunded", "chargeback", "chargedback"]);

export const yampi: Adapter = {
  requiredEnv: ["YAMPI_WEBHOOK_SECRET"],

  verify({ rawBody, headers }) {
    const signature = headers.get("x-yampi-hmac-sha256");
    return safeEqual(hmac("sha256", process.env.YAMPI_WEBHOOK_SECRET!, rawBody, "base64"), signature);
  },

  async parse({ json }) {
    const event = str(json.event) ?? "";
    const r = json.resource as Record<string, unknown> | undefined;
    const orderId = str(r?.id);
    if (!event.startsWith("order.") || !orderId || event.startsWith("order.invoice")) return null;

    const alias = str(get(r, "status", "data", "alias")) ?? "";
    let kind: "approved" | "refunded" | "ignored" = "ignored";
    if (event === "order.paid" || alias === "paid") kind = "approved";
    else if (REFUND_ALIASES.has(alias)) kind = "refunded";

    const items = (get(r, "items", "data") as unknown[] | undefined) ?? [];
    const productIds = ids(
      ...items.flatMap((item) => [
        get(item, "sku_id"),
        get(item, "product_id"),
        get(item, "sku", "data", "product_id"),
        get(item, "sku", "data", "sku"),
      ]),
    );
    const first = str(get(r, "customer", "data", "first_name"));
    const last = str(get(r, "customer", "data", "last_name"));

    return {
      provider: "yampi",
      idempotencyKey: `${event}:${orderId}:${alias}`,
      kind,
      eventType: alias ? `${event}:${alias}` : event,
      transactionId: orderId,
      productIds,
      buyer: {
        email: str(get(r, "customer", "data", "email"))?.toLowerCase() ?? null,
        name: str(get(r, "customer", "data", "name")) ?? ([first, last].filter(Boolean).join(" ") || null),
        phone: str(get(r, "customer", "data", "phone", "full_number")),
      },
    };
  },
};
