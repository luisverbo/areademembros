import type { Adapter } from "./types";
import { get, ids, safeEqual, str } from "./util";

// Hotmart (webhook 2.0.0): cabeçalho X-HOTMART-HOTTOK igual ao token da conta.
// PURCHASE_COMPLETE não é pagamento novo (fim da garantia): ignorado.
const APPROVED = new Set(["PURCHASE_APPROVED"]);
const REFUNDED = new Set(["PURCHASE_REFUNDED", "PURCHASE_CHARGEBACK", "PURCHASE_CANCELED"]);

export const hotmart: Adapter = {
  requiredEnv: ["HOTMART_HOTTOK"],

  verify({ headers }) {
    return safeEqual(headers.get("x-hotmart-hottok"), process.env.HOTMART_HOTTOK);
  },

  async parse({ json }) {
    const event = str(json.event) ?? "";
    const transaction = str(get(json, "data", "purchase", "transaction"));
    if (!event || !transaction) return null;
    const kind = APPROVED.has(event) ? "approved" : REFUNDED.has(event) ? "refunded" : "ignored";
    const phoneCode = str(get(json, "data", "buyer", "checkout_phone_code"));
    const phone = str(get(json, "data", "buyer", "checkout_phone"));

    return {
      provider: "hotmart",
      idempotencyKey: str(json.id) ?? `${transaction}:${event}`,
      kind,
      eventType: event,
      transactionId: transaction,
      productIds: ids(get(json, "data", "product", "id"), get(json, "data", "product", "ucode")),
      buyer: {
        email: str(get(json, "data", "buyer", "email"))?.toLowerCase() ?? null,
        name: str(get(json, "data", "buyer", "name")),
        phone: phone ? `${phoneCode && !phone.startsWith("+") ? `+${phoneCode}` : ""}${phone}` : null,
      },
    };
  },
};
