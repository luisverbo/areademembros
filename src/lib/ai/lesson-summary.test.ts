import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Banco simulado: guarda os updates em lesson_contents
const updates: Record<string, unknown>[] = [];
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () =>
          Promise.resolve({
            data: [
              { start_seconds: 5, text: "Boas-vindas" },
              { start_seconds: 150, text: "Conectando o WhatsApp" },
            ],
          }),
        single: () => Promise.resolve({ data: { title: "Aula 1", description: null } }),
        update: (fields: Record<string, unknown>) => {
          if (table === "lesson_contents") updates.push(fields);
          return chain;
        },
        then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
      };
      return chain;
    },
  }),
}));

const parse = vi.fn();
vi.mock("./client", () => ({
  AI_MODEL: "claude-opus-5-5",
  AI_BETAS: ["server-side-fallback-2026-07-01"],
  isAiConfigured: () => true,
  aiClient: () => ({ beta: { messages: { parse } } }),
}));

const { generateLessonSummary } = await import("./lesson-summary");

beforeEach(() => {
  updates.length = 0;
  parse.mockReset();
});

describe("generateLessonSummary", () => {
  it("envia a transcrição com minutos e salva resumo e checklist", async () => {
    parse.mockResolvedValue({
      stop_reason: "end_turn",
      parsed_output: {
        points: [{ title: "WhatsApp", detail: "Como conectar", start_seconds: 150 }],
        checklist: ["Conectar o número"],
      },
    });
    await generateLessonSummary("lesson-1");

    const req = parse.mock.calls[0][0];
    expect(req.model).toBe("claude-opus-5-5");
    expect(req.fallbacks).toBe("default");
    expect(req.betas).toContain("server-side-fallback-2026-07-01");
    expect(req.output_config.effort).toBe("medium");
    expect(req.output_config.format.type).toBe("json_schema");
    expect(req.messages[0].content).toContain("[2:30] Conectando o WhatsApp");

    expect(updates.at(0)).toMatchObject({ ai_status: "processing" });
    expect(updates.at(-1)).toMatchObject({
      ai_status: "ready",
      ai_summary: { points: [{ title: "WhatsApp", detail: "Como conectar", start_seconds: 150 }] },
      ai_checklist: ["Conectar o número"],
    });
  });

  it("recusa ou falha vira status de erro, sem exceção", async () => {
    parse.mockResolvedValue({ stop_reason: "refusal", parsed_output: null });
    await generateLessonSummary("lesson-1");
    expect(updates.at(-1)).toMatchObject({ ai_status: "error" });

    parse.mockRejectedValue(new Error("boom"));
    await generateLessonSummary("lesson-1");
    expect(updates.at(-1)).toMatchObject({ ai_status: "error", ai_error: "Falha ao gerar o resumo. Tente de novo." });
  });
});
