import { describe, expect, it } from "vitest";
import { classifyComment, isUrgent, topWords } from "./classify";

describe("classifyComment", () => {
  it.each([
    ["Como eu conecto o WhatsApp na ferramenta?", "question"],
    ["Não entendi a parte do webhook", "question"],
    ["O vídeo não carrega aqui no celular", "technical"],
    ["Está dando erro na hora de baixar o material", "technical"],
    ["Aula sem áudio a partir do minuto 5", "technical"],
    ["Que conteúdo péssimo, perda de tempo", "complaint"],
    ["Quero meu reembolso", "complaint"],
    ["Poderia fazer uma aula sobre tráfego pago", "request"],
    ["Seria legal ter um módulo de Instagram", "request"],
    ["Excelente aula, parabéns!", "praise"],
    ["Muito obrigada, ajudou demais", "praise"],
    ["ok", null],
  ])("%s → %s", (text, kind) => {
    expect(classifyComment(text)).toBe(kind);
  });

  it("problema técnico vence dúvida", () => {
    expect(classifyComment("Alguém sabe por que o vídeo não abre?")).toBe("technical");
  });
});

describe("isUrgent", () => {
  it("detecta reembolso, cancelamento e Procon", () => {
    expect(isUrgent("Vou pedir o REEMBOLSO")).toBe(true);
    expect(isUrgent("quero cancelar minha compra")).toBe(true);
    expect(isUrgent("vou no Procon")).toBe(true);
    expect(isUrgent("Reclame Aqui neles")).toBe(true);
    expect(isUrgent("Adorei a aula")).toBe(false);
  });
});

describe("topWords", () => {
  it("conta palavras uma vez por texto, sem acento e sem palavras comuns", () => {
    const words = topWords([
      "Como configurar o WhatsApp?",
      "WhatsApp não conecta, whatsapp",
      "Integração com WhatsApp e automação",
      "automação",
    ]);
    expect(words[0]).toEqual({ word: "whatsapp", count: 3 });
    expect(words).toContainEqual({ word: "automacao", count: 2 });
    expect(words.find((w) => w.word === "como")).toBeUndefined();
    expect(words.find((w) => w.word === "configurar")).toBeUndefined(); // só 1 vez
  });
});
