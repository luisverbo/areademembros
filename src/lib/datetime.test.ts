import { describe, expect, it } from "vitest";
import { formatReleaseDate, isoToZonedInput, zonedInputToIso } from "./datetime";

describe("fuso de São Paulo", () => {
  it("converte o horário digitado para UTC", () => {
    expect(zonedInputToIso("2026-10-05T19:00")).toBe("2026-10-05T22:00:00.000Z");
  });

  it("converte UTC para o valor do input", () => {
    expect(isoToZonedInput("2026-10-05T22:00:00.000Z")).toBe("2026-10-05T19:00");
    expect(isoToZonedInput(null)).toBe("");
  });

  it("ida e volta preserva o valor", () => {
    const value = "2027-01-15T08:30";
    expect(isoToZonedInput(zonedInputToIso(value))).toBe(value);
  });

  it("recusa formato inválido", () => {
    expect(zonedInputToIso("05/10/2026")).toBeNull();
  });

  it("formata o aviso de liberação", () => {
    expect(formatReleaseDate("2026-10-05T22:00:00.000Z")).toBe("seg, 05/10 · 19h");
    expect(formatReleaseDate("2026-10-05T22:30:00.000Z")).toBe("seg, 05/10 · 19h30");
  });
});
