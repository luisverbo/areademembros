import { describe, expect, it } from "vitest";
import { normalizeWhatsapp } from "./phone";

describe("normalizeWhatsapp", () => {
  it("adiciona +55 em números brasileiros", () => {
    expect(normalizeWhatsapp("(11) 99999-0000")).toBe("+5511999990000");
    expect(normalizeWhatsapp("11 3333-4444")).toBe("+551133334444");
  });

  it("mantém DDI informado", () => {
    expect(normalizeWhatsapp("+55 11 99999-0000")).toBe("+5511999990000");
    expect(normalizeWhatsapp("+351 912 345 678")).toBe("+351912345678");
  });

  it("recusa o que não é telefone", () => {
    expect(normalizeWhatsapp("abc")).toBeNull();
    expect(normalizeWhatsapp("123")).toBeNull();
  });
});
