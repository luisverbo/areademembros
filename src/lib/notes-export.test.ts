import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { notebookToDocx, notebookToPdf } = await import("./notes-export");

const sample = [
  {
    id: "c1",
    title: "IA para Negócios Locais",
    lessons: [
      {
        id: "l1",
        title: "Conectando o WhatsApp",
        moduleTitle: "M1",
        order: 0,
        notes: [
          { id: "n1", content: "Ação: configurar o número 😀\nSegunda linha com acentuação: ção, ã, é", timestamp_seconds: 150, updated_at: "" },
          { id: "n2", content: "x".repeat(3000), timestamp_seconds: null, updated_at: "" },
        ],
      },
    ],
  },
];

describe("exportação do caderno", () => {
  it("gera PDF válido mesmo com emoji e textos longos", async () => {
    const bytes = await notebookToPdf(sample, "Meu Caderno");
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it("gera Word (.docx é um zip)", async () => {
    const buf = await notebookToDocx(sample, "Meu Caderno");
    expect(buf.subarray(0, 2).toString()).toBe("PK");
  });
});
