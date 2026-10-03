import { PDFDocument } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { certificateToPdf } = await import("./certificate-pdf");
const { formatLongDate: formatIssuedDate } = await import("./datetime");

describe("certificado em PDF", () => {
  it("gera uma página A4 paisagem, mesmo com nome longo e acentos", async () => {
    const bytes = await certificateToPdf({
      studentName: "Maria da Conceição Gonçalves de Albuquerque e Silva Pereira",
      courseTitle: "IA para Negócios Locais — Mentoria",
      hours: 12,
      issuedAt: "2026-10-03T15:00:00Z",
      code: "ABC123DEF456",
      appName: "LC.Academy",
      verifyUrl: "https://lc.test/certificado/ABC123DEF456",
    });
    expect(Buffer.from(bytes.subarray(0, 4)).toString()).toBe("%PDF");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getPage(0).getSize()).toEqual({ width: 842, height: 595 });
    expect(doc.getTitle()).toContain("IA para Negócios Locais");
  });

  it("data por extenso no fuso de São Paulo", () => {
    expect(formatIssuedDate("2026-10-03T01:00:00Z")).toBe("2 de outubro de 2026");
  });
});
