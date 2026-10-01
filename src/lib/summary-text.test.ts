import { describe, expect, it } from "vitest";
import { parseChecklistLines, parseSummaryLines, summaryToLines } from "./summary-text";

describe("resumo escrito pelo admin", () => {
  it("lê minuto, título e detalhe", () => {
    expect(parseSummaryLines("2:30 Conectar o WhatsApp — ligando o número\n[0:05] Boas-vindas\nSem minuto: só texto")).toEqual([
      { title: "Conectar o WhatsApp", detail: "ligando o número", start_seconds: 150 },
      { title: "Boas-vindas", detail: "", start_seconds: 5 },
      { title: "Sem minuto", detail: "só texto", start_seconds: null },
    ]);
  });

  it("ida e volta", () => {
    const text = "2:30 Conectar o WhatsApp — ligando o número\nBoas-vindas";
    expect(summaryToLines(parseSummaryLines(text))).toBe(text);
  });

  it("checklist tira marcadores", () => {
    expect(parseChecklistLines("- Conectar\n1. Testar\n[ ] Revisar\n\n")).toEqual(["Conectar", "Testar", "Revisar"]);
  });
});
