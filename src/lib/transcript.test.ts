import { describe, expect, it } from "vitest";
import { formatTimestamp, parseTranscript, timestampToSeconds, transcriptForPrompt } from "./transcript";

const VTT = `WEBVTT
Kind: captions
Language: pt

00:00:01.000 --> 00:00:04.000
Olá, <c>sejam</c> bem-vindos

00:00:04.000 --> 00:00:08.500
Olá, <c>sejam</c> bem-vindos

00:00:40.000 --> 00:00:45.000
Agora vamos conectar o WhatsApp
`;

const SRT = `1
00:01:05,000 --> 00:01:09,000
Primeiro abra o painel

2
00:01:10,500 --> 00:01:14,000
e clique em Integrações
`;

describe("parseTranscript", () => {
  it("lê WebVTT, tira tags e repetições, junta em blocos", () => {
    const t = parseTranscript(VTT);
    expect(t.hasTimestamps).toBe(true);
    expect(t.segments).toEqual([
      { start: 1, end: 4, text: "Olá, sejam bem-vindos" },
      { start: 40, end: 45, text: "Agora vamos conectar o WhatsApp" },
    ]);
  });

  it("lê SRT com vírgula nos milissegundos", () => {
    const t = parseTranscript(SRT);
    expect(t.segments).toEqual([{ start: 65, end: 74, text: "Primeiro abra o painel e clique em Integrações" }]);
  });

  it("lê texto com minutos no começo da linha", () => {
    const t = parseTranscript("[0:05] Introdução\n[12:30] Conectando o WhatsApp\ncontinuação da fala\n1:02:03 Encerramento");
    expect(t.segments.map((s) => s.start)).toEqual([5, 750, 3723]);
    expect(t.segments[1].text).toBe("Conectando o WhatsApp continuação da fala");
  });

  it("texto corrido vira parágrafos sem minutos", () => {
    const t = parseTranscript("Parágrafo um.\n\nParágrafo dois.");
    expect(t.hasTimestamps).toBe(false);
    expect(t.segments.map((s) => s.text)).toEqual(["Parágrafo um.", "Parágrafo dois."]);
  });

  it("vazio", () => {
    expect(parseTranscript("  ").segments).toEqual([]);
  });
});

describe("minutos", () => {
  it("formata e converte", () => {
    expect(formatTimestamp(754)).toBe("12:34");
    expect(formatTimestamp(3723)).toBe("1:02:03");
    expect(timestampToSeconds("12:34")).toBe(754);
    expect(timestampToSeconds("1:02:03")).toBe(3723);
    expect(transcriptForPrompt([{ start_seconds: 65, text: "Oi" }])).toBe("[1:05] Oi");
  });
});
