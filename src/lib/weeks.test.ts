import { describe, expect, it } from "vitest";
import { lastWeeks, weekStart } from "./weeks";

describe("semanas do painel", () => {
  it("semana começa na segunda, no fuso de São Paulo", () => {
    expect(weekStart("2026-10-01T12:00:00Z")).toBe("2026-09-28"); // quarta → segunda
    expect(weekStart("2026-09-28T02:00:00Z")).toBe("2026-09-21"); // domingo 23h em SP
  });
  it("8 semanas, da mais antiga para a atual", () => {
    const weeks = lastWeeks(8, new Date("2026-10-03T12:00:00Z").getTime());
    expect(weeks).toHaveLength(8);
    expect(weeks.at(-1)).toEqual({ key: "2026-09-28", label: "28/09" });
    expect(weeks[0].key).toBe("2026-08-10");
  });
});
