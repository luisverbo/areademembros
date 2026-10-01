import { describe, expect, it } from "vitest";
import { z } from "zod";
import { formatDuration, formFields, parseDuration, parseForm } from "./forms";

const schema = z.object({
  title: formFields.text(),
  note: formFields.optionalText(),
  free: formFields.checkbox(),
  minutes: formFields.optionalInt(),
  link: formFields.optionalUrl(),
});

function fd(entries: Record<string, string>) {
  const data = new FormData();
  Object.entries(entries).forEach(([k, v]) => data.set(k, v));
  return data;
}

describe("parseForm", () => {
  it("converte os campos", () => {
    const r = parseForm(schema, fd({ title: " Aula 1 ", note: "", free: "on", minutes: "15", link: "https://x.com/a" }));
    expect(r).toEqual({ success: true, data: { title: "Aula 1", note: null, free: true, minutes: 15, link: "https://x.com/a" } });
  });

  it("campos ausentes viram null/false", () => {
    const r = parseForm(schema, fd({ title: "x" }));
    expect(r).toEqual({ success: true, data: { title: "x", note: null, free: false, minutes: null, link: null } });
  });

  it("aponta os erros por campo", () => {
    const r = parseForm(schema, fd({ title: "", minutes: "-1", link: "javascript:alert(1)" }));
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(Object.keys(r.state.errors ?? {}).sort()).toEqual(["link", "minutes", "title"]);
    }
  });
});

describe("duração", () => {
  it("lê minutos:segundos, horas e segundos puros", () => {
    expect(parseDuration("15:30")).toBe(930);
    expect(parseDuration("1:02:03")).toBe(3723);
    expect(parseDuration("90")).toBe(90);
    expect(parseDuration("15:75")).toBeNull();
    expect(parseDuration("abc")).toBeNull();
  });

  it("formata de volta", () => {
    expect(formatDuration(930)).toBe("15:30");
    expect(formatDuration(3723)).toBe("1:02:03");
    expect(formatDuration(null)).toBe("");
  });
});
