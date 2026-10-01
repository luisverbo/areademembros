import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asaas } from "./asaas";
import { hotmart } from "./hotmart";
import { kiwify } from "./kiwify";
import { mercadopago } from "./mercadopago";
import type { WebhookContext } from "./types";
import { yampi } from "./yampi";

function ctx(body: unknown, headers: Record<string, string> = {}, query = ""): WebhookContext {
  const rawBody = JSON.stringify(body);
  return { rawBody, json: JSON.parse(rawBody), headers: new Headers(headers), query: new URLSearchParams(query) };
}

beforeEach(() => {
  process.env.KIWIFY_WEBHOOK_TOKEN = "kiwi-token";
  process.env.HOTMART_HOTTOK = "hot-token";
  process.env.YAMPI_WEBHOOK_SECRET = "wh_yampi";
  process.env.MERCADOPAGO_WEBHOOK_SECRET = "mp-secret";
  process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-x";
  process.env.ASAAS_WEBHOOK_TOKEN = "asaas-token-0123456789-0123456789";
  process.env.ASAAS_API_KEY = "$aact_prod_x";
});
afterEach(() => vi.unstubAllGlobals());

describe("Kiwify", () => {
  const order = {
    order_id: "a1b2",
    order_status: "paid",
    webhook_event_type: "order_approved",
    Product: { product_id: "prod-uuid", product_name: "Mentoria" },
    Customer: { full_name: "Maria Souza", email: "Maria@Email.com", mobile: "+5547999990000" },
  };

  it("assinatura HMAC-SHA1 do corpo na query", () => {
    const c = ctx(order);
    const sig = createHmac("sha1", "kiwi-token").update(c.rawBody).digest("hex");
    expect(kiwify.verify({ ...c, query: new URLSearchParams({ signature: sig }) })).toBe(true);
    expect(kiwify.verify({ ...c, query: new URLSearchParams({ signature: "0".repeat(40) }) })).toBe(false);
    expect(kiwify.verify(c)).toBe(false);
  });

  it("aceita o formato embrulhado em { order }", async () => {
    const sig = createHmac("sha1", "kiwi-token").update(JSON.stringify(order)).digest("hex");
    const c = ctx({ url: "https://x", signature: sig, order });
    expect(kiwify.verify(c)).toBe(true);
    expect((await kiwify.parse(c))?.transactionId).toBe("a1b2");
  });

  it("traduz compra aprovada e reembolso", async () => {
    const approved = await kiwify.parse(ctx(order));
    expect(approved).toMatchObject({
      kind: "approved",
      transactionId: "a1b2",
      productIds: ["prod-uuid"],
      buyer: { email: "maria@email.com", name: "Maria Souza", phone: "+5547999990000" },
    });
    const refund = await kiwify.parse(ctx({ ...order, order_status: "refunded", webhook_event_type: "order_refunded" }));
    expect(refund?.kind).toBe("refunded");
    const chargeback = await kiwify.parse(ctx({ ...order, order_status: "chargedback", webhook_event_type: "chargeback" }));
    expect(chargeback?.kind).toBe("refunded");
    expect(refund?.idempotencyKey).not.toBe(approved?.idempotencyKey);
    expect((await kiwify.parse(ctx({ ...order, order_status: "waiting_payment", webhook_event_type: "pix_created" })))?.kind).toBe(
      "ignored",
    );
  });
});

describe("Hotmart", () => {
  const body = {
    id: "evt-uuid",
    event: "PURCHASE_APPROVED",
    version: "2.0.0",
    data: {
      product: { id: 1234567, ucode: "uc-1", name: "Mentoria" },
      buyer: { email: "joao@email.com", name: "João Pereira", checkout_phone: "11999990000", checkout_phone_code: "55" },
      purchase: { transaction: "HP123", status: "APPROVED" },
    },
  };

  it("valida o hottok", () => {
    expect(hotmart.verify(ctx(body, { "X-HOTMART-HOTTOK": "hot-token" }))).toBe(true);
    expect(hotmart.verify(ctx(body, { "X-HOTMART-HOTTOK": "errado" }))).toBe(false);
  });

  it("traduz eventos; PURCHASE_COMPLETE não é compra nova", async () => {
    expect(await hotmart.parse(ctx(body))).toMatchObject({
      kind: "approved",
      idempotencyKey: "evt-uuid",
      transactionId: "HP123",
      productIds: ["1234567", "uc-1"],
      buyer: { email: "joao@email.com", phone: "+5511999990000" },
    });
    expect((await hotmart.parse(ctx({ ...body, event: "PURCHASE_COMPLETE" })))?.kind).toBe("ignored");
    expect((await hotmart.parse(ctx({ ...body, event: "PURCHASE_CHARGEBACK" })))?.kind).toBe("refunded");
    expect((await hotmart.parse(ctx({ ...body, event: "PURCHASE_REFUNDED" })))?.kind).toBe("refunded");
  });
});

describe("Yampi", () => {
  const body = {
    event: "order.paid",
    resource: {
      id: 987,
      number: 1001,
      status: { data: { alias: "paid" } },
      customer: { data: { email: "ana@email.com", first_name: "Ana", last_name: "Lima", phone: { full_number: "11988887777" } } },
      items: { data: [{ sku_id: 555, sku: { data: { product_id: 444 } } }] },
    },
  };

  it("assinatura base64 HMAC-SHA256 no cabeçalho", () => {
    const c = ctx(body);
    const sig = createHmac("sha256", "wh_yampi").update(c.rawBody).digest("base64");
    expect(yampi.verify({ ...c, headers: new Headers({ "X-Yampi-Hmac-SHA256": sig }) })).toBe(true);
    expect(yampi.verify(c)).toBe(false);
  });

  it("aceita SKU ou produto e trata cancelamento como estorno", async () => {
    expect(await yampi.parse(ctx(body))).toMatchObject({
      kind: "approved",
      transactionId: "987",
      productIds: ["555", "444"],
      buyer: { email: "ana@email.com", name: "Ana Lima" },
    });
    const cancelled = await yampi.parse(
      ctx({ ...body, event: "order.status.updated", resource: { ...body.resource, status: { data: { alias: "cancelled" } } } }),
    );
    expect(cancelled?.kind).toBe("refunded");
    expect(await yampi.parse(ctx({ ...body, event: "order.invoice.created" }))).toBeNull();
  });
});

describe("Mercado Pago", () => {
  const body = { action: "payment.updated", type: "payment", data: { id: "123456789" } };

  function signed(ts: string, requestId: string) {
    const v1 = createHmac("sha256", "mp-secret").update(`id:123456789;request-id:${requestId};ts:${ts};`).digest("hex");
    return ctx(body, { "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": requestId }, "data.id=123456789&type=payment");
  }

  it("valida o manifesto como o SDK oficial", () => {
    expect(mercadopago.verify(signed("1700000000", "req-1"))).toBe(true);
    const bad = signed("1700000000", "req-1");
    bad.headers.set("x-request-id", "outro");
    expect(mercadopago.verify(bad)).toBe(false);
  });

  it("busca o pagamento e usa external_reference como produto", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        id: 123456789,
        status: "approved",
        external_reference: "mentoria-t1",
        payer: { email: "PAGADOR@email.com" },
        additional_info: { payer: { first_name: "Rui", last_name: "Silva" }, items: [{ id: "item-9" }] },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const event = await mercadopago.parse(signed("1", "r"));
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.mercadopago.com/v1/payments/123456789");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer APP_USR-x");
    expect(event).toMatchObject({
      kind: "approved",
      productIds: ["mentoria-t1", "item-9"],
      buyer: { email: "pagador@email.com", name: "Rui Silva" },
    });
  });

  it("estorno e chargeback; teste com ID falso é ignorado", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ id: 1, status: "charged_back" })));
    expect((await mercadopago.parse(signed("1", "r")))?.kind).toBe("refunded");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 404 })));
    expect(await mercadopago.parse(signed("1", "r"))).toBeNull();
  });
});

describe("Asaas", () => {
  const body = {
    id: "evt_1",
    event: "PAYMENT_RECEIVED",
    payment: { id: "pay_1", customer: "cus_1", paymentLink: "link_abc", externalReference: null },
  };

  it("valida o token do cabeçalho", () => {
    expect(asaas.verify(ctx(body, { "asaas-access-token": "asaas-token-0123456789-0123456789" }))).toBe(true);
    expect(asaas.verify(ctx(body, { "asaas-access-token": "x" }))).toBe(false);
  });

  it("busca o cliente para pegar o e-mail", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ name: "Bia Costa", email: "bia@email.com", mobilePhone: "11977776666" }));
    vi.stubGlobal("fetch", fetchMock);
    const event = await asaas.parse(ctx(body));
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.asaas.com/v3/customers/cus_1");
    expect(fetchMock.mock.calls[0][1].headers.access_token).toBe("$aact_prod_x");
    expect(event).toMatchObject({ kind: "approved", idempotencyKey: "evt_1", productIds: ["link_abc"], buyer: { email: "bia@email.com" } });
  });

  it("estorno não precisa buscar cliente", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await asaas.parse(ctx({ ...body, event: "PAYMENT_REFUNDED" })))?.kind).toBe("refunded");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
