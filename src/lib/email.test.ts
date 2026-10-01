import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ env: { appName: "LC.Academy", siteUrl: "https://lc.test" } }));

const { accessEmail, centralEmail, escapeHtml, isEmailConfigured, magicLinkEmail, sendEmail, textToHtml } = await import("./email");

afterEach(() => {
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  vi.unstubAllGlobals();
});

describe("e-mails", () => {
  it("escapa HTML de dados do usuário", () => {
    expect(escapeHtml(`<b>"x"</b> & 'y'`)).toBe("&lt;b&gt;&quot;x&quot;&lt;/b&gt; &amp; &#39;y&#39;");
    const m = accessEmail("a@b.c", "https://lc.test/auth/confirm?x=1&y=2", { name: "<script>", courseTitle: "IA & Negócios" });
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("IA &amp; Negócios");
    expect(m.html).toContain("x=1&amp;y=2");
    expect(m.text).toContain("https://lc.test/auth/confirm?x=1&y=2");
  });

  it("assunto e saudação com o primeiro nome", () => {
    const m = accessEmail("a@b.c", "https://x", { name: "Maria Souza", courseTitle: "Mentoria" });
    expect(m.subject).toBe("Seu acesso: Mentoria");
    expect(m.html).toContain("Maria, seu acesso a Mentoria está liberado!");
  });

  it("sem chave não envia", async () => {
    expect(isEmailConfigured()).toBe(false);
    expect(await sendEmail(magicLinkEmail("a@b.c", "https://x"))).toEqual({ ok: false, error: "email_not_configured" });
  });

  it("envia pela API do Resend", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "LC.Academy <acesso@lc.test>";
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendEmail(magicLinkEmail("a@b.c", "https://x"))).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_test");
    expect(JSON.parse(init.body)).toMatchObject({ from: "LC.Academy <acesso@lc.test>", to: ["a@b.c"], subject: "Seu link de acesso" });
  });

  it("falha do Resend vira erro, sem exceção", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "x@lc.test";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad", { status: 422 })));
    expect(await sendEmail(magicLinkEmail("a@b.c", "https://x"))).toEqual({ ok: false, error: "resend_422" });
  });
});

describe("e-mail da Central", () => {
  it("links clicáveis, parágrafos e texto escapado", () => {
    const html = textToHtml("Oi <b>Ana</b>!\nVeja https://lc.test/aula/1.\n\nFim");
    expect(html).toContain("&lt;b&gt;Ana&lt;/b&gt;");
    expect(html).toContain('<a href="https://lc.test/aula/1" style="color:#D63A42">https://lc.test/aula/1</a>.');
    expect(html.match(/<p /g)).toHaveLength(2);
    expect(html).toContain("<br>");
  });

  it("sempre com descadastro (rodapé e cabeçalho de um clique)", () => {
    const m = centralEmail("a@b.c", { subject: "Live hoje", body: "Oi!", unsubscribeUrl: "https://lc.test/descadastro/tok" });
    expect(m.html).toContain('href="https://lc.test/descadastro/tok"');
    expect(m.text).toContain("https://lc.test/descadastro/tok");
    expect(m.headers).toEqual({
      "List-Unsubscribe": "<https://lc.test/descadastro/tok/um-clique>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });

  it("envia os cabeçalhos ao Resend", async () => {
    process.env.RESEND_API_KEY = "re_x";
    process.env.EMAIL_FROM = "LC <a@lc.test>";
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ id: "em_1" }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await sendEmail(centralEmail("a@b.c", { subject: "S", body: "B", unsubscribeUrl: "https://lc.test/d/t" }));
    expect(result).toEqual({ ok: true, id: "em_1" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });
});
