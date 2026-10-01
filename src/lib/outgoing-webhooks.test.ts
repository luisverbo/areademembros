import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

const { signPayload } = await import("./outgoing-webhooks");

describe("assinatura dos webhooks de saída", () => {
  it("HMAC-SHA256 em hex do corpo exato", () => {
    const body = '{"event":"lead.created"}';
    expect(signPayload("segredo", body)).toBe(`sha256=${createHmac("sha256", "segredo").update(body).digest("hex")}`);
  });
});
