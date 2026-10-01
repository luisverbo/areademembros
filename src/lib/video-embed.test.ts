import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ env: { siteUrl: "https://lc.test" } }));

const { bunnyToken, embedFor } = await import("./video-embed");

afterEach(() => {
  delete process.env.BUNNY_LIBRARY_ID;
  delete process.env.BUNNY_TOKEN_KEY;
});

describe("embedFor", () => {
  it("Bunny assinado com validade", () => {
    process.env.BUNNY_LIBRARY_ID = "123";
    process.env.BUNNY_TOKEN_KEY = "segredo";
    const embed = embedFor("bunny", "abc-guid");
    const url = new URL(embed!.src);
    expect(url.origin + url.pathname).toBe("https://iframe.mediadelivery.net/embed/123/abc-guid");
    const expires = Number(url.searchParams.get("expires"));
    expect(expires).toBeGreaterThan(Date.now() / 1000);
    expect(url.searchParams.get("token")).toBe(createHash("sha256").update(`segredoabc-guid${expires}`).digest("hex"));
  });

  it("Bunny sem biblioteca configurada não gera player", () => {
    expect(embedFor("bunny", "abc")).toBeNull();
  });

  it("YouTube sem cookies e com API ligada", () => {
    const url = new URL(embedFor("youtube", "dQw4w9WgXcQ")!.src);
    expect(url.hostname).toBe("www.youtube-nocookie.com");
    expect(url.searchParams.get("enablejsapi")).toBe("1");
    expect(url.searchParams.get("origin")).toBe("https://lc.test");
  });

  it("token é determinístico", () => {
    expect(bunnyToken("k", "v", 1)).toBe(createHash("sha256").update("kv1").digest("hex"));
  });
});
