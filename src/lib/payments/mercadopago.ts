import type { Adapter } from "./types";
import { get, hmac, ids, safeEqual, str } from "./util";

// Mercado Pago: x-signature "ts=..,v1=.." com HMAC-SHA256 hex do manifesto
// "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" (igual ao SDK oficial). O aviso só traz o ID:
// buscamos o pagamento em /v1/payments/{id}. Produto = external_reference (definido ao criar o link pela API)
// ou o ID do item.
const REFUNDED = new Set(["refunded", "charged_back", "cancelled"]);

function dataId(json: Record<string, unknown>, query: URLSearchParams): string | null {
  return query.get("data.id") ?? str(get(json, "data", "id")) ?? query.get("id");
}

export const mercadopago: Adapter = {
  requiredEnv: ["MERCADOPAGO_WEBHOOK_SECRET", "MERCADOPAGO_ACCESS_TOKEN"],

  verify({ json, headers, query }) {
    const header = headers.get("x-signature");
    if (!header) return false;
    const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=", 2) as [string, string]));
    if (!parts.ts || !parts.v1) return false;
    const id = dataId(json, query);
    const requestId = headers.get("x-request-id");
    let manifest = "";
    if (id) manifest += `id:${/^[a-z0-9]+$/i.test(id) ? id.toLowerCase() : id};`;
    if (requestId) manifest += `request-id:${requestId};`;
    manifest += `ts:${parts.ts};`;
    return safeEqual(hmac("sha256", process.env.MERCADOPAGO_WEBHOOK_SECRET!, manifest), parts.v1);
  },

  async parse({ json, query }) {
    const type = str(json.type) ?? query.get("type") ?? query.get("topic");
    const id = dataId(json, query);
    if (type !== "payment" || !id || !/^\d+$/.test(id)) return null;

    const res = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
      headers: { Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404) return null; // teste do painel com ID falso
    if (!res.ok) throw new Error(`mercadopago payments ${res.status}`);
    const p = (await res.json()) as Record<string, unknown>;

    const status = str(p.status) ?? "";
    const kind = status === "approved" ? "approved" : REFUNDED.has(status) ? "refunded" : "ignored";
    const items = (get(p, "additional_info", "items") as unknown[] | undefined) ?? [];
    const first = str(get(p, "additional_info", "payer", "first_name")) ?? str(get(p, "payer", "first_name"));
    const last = str(get(p, "additional_info", "payer", "last_name")) ?? str(get(p, "payer", "last_name"));
    const area = str(get(p, "payer", "phone", "area_code")) ?? str(get(p, "additional_info", "payer", "phone", "area_code"));
    const number = str(get(p, "payer", "phone", "number")) ?? str(get(p, "additional_info", "payer", "phone", "number"));

    return {
      provider: "mercadopago",
      idempotencyKey: `${id}:${status}`,
      kind,
      eventType: `payment:${status}`,
      transactionId: id,
      productIds: ids(p.external_reference, get(p, "metadata", "product_id"), ...items.map((i) => get(i, "id"))),
      buyer: {
        email: str(get(p, "payer", "email"))?.toLowerCase() ?? null,
        name: [first, last].filter(Boolean).join(" ") || null,
        phone: number ? `${area ?? ""}${number}` : null,
      },
    };
  },
};
