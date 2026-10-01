import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { sendWhatsapp, templateParam, whatsappProvider } = await import("./whatsapp");

const KEYS = [
  "WHATSAPP_PROVIDER",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_TOKEN",
  "WHATSAPP_TEMPLATE",
  "ZAPI_INSTANCE_ID",
  "ZAPI_TOKEN",
  "ZAPI_CLIENT_TOKEN",
];
beforeEach(() => KEYS.forEach((k) => delete process.env[k]));
afterEach(() => vi.unstubAllGlobals());

describe("whatsappProvider", () => {
  it("sem variáveis, nenhum", () => {
    expect(whatsappProvider()).toBeNull();
  });
  it("Meta é o padrão; Z-API quando escolhida", () => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123";
    process.env.WHATSAPP_TOKEN = "tok";
    expect(whatsappProvider()).toBe("meta");
    process.env.WHATSAPP_PROVIDER = "zapi";
    expect(whatsappProvider()).toBeNull();
    process.env.ZAPI_INSTANCE_ID = "inst";
    process.env.ZAPI_TOKEN = "zt";
    expect(whatsappProvider()).toBe("zapi");
  });
});

describe("templateParam", () => {
  it("tira quebras de linha e tabs (regra da Meta)", () => {
    expect(templateParam("Linha 1\n\nLinha 2\tfim     x")).toBe("Linha 1 · Linha 2 fim   x");
  });
});

describe("sendWhatsapp", () => {
  it("Meta com modelo: nome e texto como variáveis", async () => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = "555";
    process.env.WHATSAPP_TOKEN = "tok";
    process.env.WHATSAPP_TEMPLATE = "aviso_lc";
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ messages: [{ id: "wamid.1" }] }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendWhatsapp("+5511999990000", "Aula nova!\nVeja", { name: "Ana" })).toEqual({ ok: true, id: "wamid.1" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://graph.facebook.com/v23.0/555/messages");
    expect(init.headers.Authorization).toBe("Bearer tok");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ to: "5511999990000", type: "template", template: { name: "aviso_lc", language: { code: "pt_BR" } } });
    expect(body.template.components[0].parameters.map((p: { text: string }) => p.text)).toEqual(["Ana", "Aula nova! · Veja"]);
  });

  it("Meta sem modelo: texto livre; erro da API vira mensagem", async () => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = "555";
    process.env.WHATSAPP_TOKEN = "tok";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ error: { code: 131047, message: "Re-engagement message" } }, { status: 400 })),
    );
    expect(await sendWhatsapp("+5511999990000", "oi")).toEqual({ ok: false, error: "meta_131047: Re-engagement message" });
  });

  it("Z-API com Client-Token", async () => {
    process.env.WHATSAPP_PROVIDER = "zapi";
    process.env.ZAPI_INSTANCE_ID = "inst";
    process.env.ZAPI_TOKEN = "zt";
    process.env.ZAPI_CLIENT_TOKEN = "ct";
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ zaapId: "z1", messageId: "m1" }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendWhatsapp("+5511988887777", "Olá")).toEqual({ ok: true, id: "m1" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.z-api.io/instances/inst/token/zt/send-text");
    expect(init.headers["Client-Token"]).toBe("ct");
    expect(JSON.parse(init.body)).toEqual({ phone: "5511988887777", message: "Olá" });
  });

  it("sem configuração não chama a rede", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendWhatsapp("+5511988887777", "Olá")).toEqual({ ok: false, error: "whatsapp_not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
